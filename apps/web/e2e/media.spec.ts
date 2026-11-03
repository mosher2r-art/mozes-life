import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
  const suffix=randomUUID().slice(0,8),clipName=`clip-${suffix}.mp4`,posterName=`poster-${suffix}.jpg`,chapterTitle=`פרק וידאו E2E ${suffix}`,courseTitle=`קורס וידאו E2E ${suffix}`;
  await login(page, "admin");
  await page.getByRole("link", { name: "ספריית מדיה" }).click();

  // Real files are accepted and verified
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles([{name:clipName,mimeType:"video/mp4",buffer:readFileSync(demo("demo-clip.mp4"))},{name:posterName,mimeType:"image/jpeg",buffer:readFileSync(demo("demo-poster.jpg"))}]);
  await expect(page.getByText(clipName,{exact:true})).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(posterName,{exact:true})).toBeVisible();

  // These are synthetic software fixtures. Approval is explicit, never inferred from upload.
  for (const name of [clipName, posterName]) {
    const card=page.locator(".media-card",{hasText:name});
    await card.getByRole("button",{name:"פרטי נכס, רישיון וגרסאות"}).click();
    await page.getByLabel("מקור הקובץ").fill("Synthetic automated software fixture only");
    await page.getByLabel("סוג הרישיון").fill("Software test fixture");
    await page.getByLabel("האם מותר שימוש מסחרי?").selectOption("true");
    await page.getByRole("button",{name:"אישור רפואי לאחר בדיקת הנכס"}).click();
    await expect(page.getByLabel("מקור הקובץ")).toHaveCount(0);
  }

  // A disguised file is rejected after the bytes are inspected
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByText("תוכן הקובץ או גודלו אינם תואמים; ההעלאה לא אושרה.")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".media-name", { hasText: "fake.png" })).toHaveCount(0);

  // Unsupported type never leaves the browser
  await page.getByLabel("בחירת קבצים להעלאה").setInputFiles({ name: "page.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText(/סוג הקובץ אינו נתמך/)).toBeVisible();

  // Build a chapter with a video screen
  await page.getByRole("link", { name: "מאגר פרקים" }).click();
  await page.getByLabel("שם הפרק").fill(chapterTitle);
  await page.getByRole("button", { name: "יצירת פרק" }).click();
  await expect(page).toHaveURL(/\/studio\/chapters\/ch-/);
  await page.getByRole("button", { name: "+ הוספת מסך" }).first().click();
  await page.getByRole("dialog", { name: "הוספת מסך" }).getByRole("button", { name: /^וידאו/ }).click();
  await expect(page.getByRole("dialog", { name: /בחירת קובץ לוידאו/ })).toBeVisible();
  await page.getByRole("button", { name: `בחירת ${clipName}`,exact:true }).click();
  await expect(page.getByText("כל השינויים נשמרו")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "תצוגה מקדימה" }).click();
  const video = page.getByRole("dialog", { name: "תצוגה מקדימה" }).locator(".mp-player video");
  await expect(video).toHaveCount(1);
  const src = await video.locator("source").getAttribute("src");
  expect(src).toMatch(/^\/api\/media\/a-[a-f0-9-]+\/versions\/[a-zA-Z0-9-]+$/);
  const ranged = await page.request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"]).toBe("video/mp4");
  await page.screenshot({ path: "test-results/screens/editor-video.png" });
  await page.getByRole("button", { name: "סגירה" }).click();

  // A file in use cannot be deleted
  const id = src!.split("/")[3]!;
  expect((await page.request.delete(`/api/studio/media/${id}`)).status()).toBe(409);

  // Course with this chapter: publish and assign
  await page.goto("/studio/courses");
  await page.getByLabel("קורס חדש").fill(courseTitle);
  await page.getByRole("button", { name: "יצירת קורס" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/c-/);
  await page.getByRole("button", { name: "+ הוספת פרק" }).first().click();
  await page.getByRole("dialog").getByRole("checkbox", { name: new RegExp(chapterTitle) }).check();
  await page.getByRole("dialog").getByRole("button", { name: "הוספה לקורס" }).click();
  await expect(page.locator(".cb-chapter")).toHaveCount(1);
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText(/גרסה 1 פורסמה/)).toBeVisible();
  await page.goto("/studio/courses");
  await page.getByRole("row", { name: new RegExp(courseTitle) }).getByRole("link", { name: "גישה ולומדים" }).click();
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill(USERS.learner.email);
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByText(/כבר היו במערכת/)).toBeVisible();

  // Learner plays it; anonymous users cannot fetch media
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await login(lp, "learner");
  await lp.locator(".course-card", { hasText: courseTitle }).getByRole("link").click();
  await lp.getByRole("button", { name: "המשך", exact: true }).click();
  const lsrc = await lp.locator(".mp-player video source").getAttribute("src");
  expect(lsrc?.split("?")[0]).toBe(src);
  expect(lsrc).toContain("enrollment=");
  expect((await lp.request.get(lsrc!)).status()).toBe(200);
  await ctx.close();
  const anon = await browser.newContext();
  expect((await anon.request.get(new URL(src!, page.url()).toString())).status()).toBe(401);
  await anon.close();
});
