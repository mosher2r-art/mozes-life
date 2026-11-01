import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

const demo = (f: string) => path.resolve("public", "demo", f);
test.describe.configure({ mode: "serial" });

test("upload media, build a video screen, publish, and the learner can play it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  test.setTimeout(120_000);
  await login(page, "admin");
  await page.getByRole("link", { name: "ספריית מדיה" }).click();

  // Real files are accepted and verified
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles([demo("demo-clip.mp4"), demo("demo-poster.jpg")]);
  await expect(page.getByText("demo-clip.mp4")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("demo-poster.jpg")).toBeVisible();

  // A disguised file is rejected after the bytes are inspected
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByText("תוכן הקובץ אינו תואם את סוגו, ולכן הוא נדחה.")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".media-name", { hasText: "fake.png" })).toHaveCount(0);

  // Unsupported type never leaves the browser
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles({ name: "page.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText(/סוג הקובץ אינו נתמך/)).toBeVisible();

  // Build a course with a video screen
  await page.getByRole("link", { name: "קורסים" }).click();
  await page.getByLabel("קורס חדש").fill("קורס וידאו E2E");
  await page.getByRole("button", { name: "יצירת קורס" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/c-/);
  await page.getByRole("button", { name: "+ מסך" }).click();
  await page.locator(".ed-picker").getByRole("button", { name: /^וידאו/ }).click();
  await expect(page.getByRole("dialog", { name: /בחירת קובץ לוידאו/ })).toBeVisible();
  await page.getByRole("button", { name: "בחירת demo-clip.mp4" }).click();
  const video = page.locator(".mp-player video");
  await expect(video).toHaveCount(1);
  const src = await video.locator("source").getAttribute("src");
  expect(src).toMatch(/^\/api\/media\/a-[a-f0-9]+$/);
  const ranged = await page.request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"]).toBe("video/mp4");
  await expect(page.getByText("כל השינויים נשמרו")).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "test-results/screens/editor-video.png" });

  // A file in use cannot be deleted
  const id = src!.split("/").pop()!;
  expect((await page.request.delete(`/api/studio/media/${id}`)).status()).toBe(409);

  // Publish and assign
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText(/גרסה 1 פורסמה/)).toBeVisible();
  await page.goto("/studio/courses");
  await page.getByRole("row", { name: /קורס וידאו E2E/ }).getByRole("link", { name: "גישה ולומדים" }).click();
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill(USERS.learner.email);
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByText(/כבר היו במערכת/)).toBeVisible();

  // Learner plays it; anonymous users cannot fetch media
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await login(lp, "learner");
  await lp.locator(".course-card", { hasText: "קורס וידאו E2E" }).getByRole("link").click();
  await lp.getByRole("button", { name: "המשך", exact: true }).click();
  const lsrc = await lp.locator(".mp-player video source").getAttribute("src");
  expect(lsrc).toBe(src);
  expect((await lp.request.get(lsrc!)).status()).toBe(200);
  await ctx.close();
  const anon = await browser.newContext();
  expect((await anon.request.get(new URL(src!, page.url()).toString())).status()).toBe(401);
  await anon.close();
});
