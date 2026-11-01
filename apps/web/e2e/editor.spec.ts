import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test.describe.configure({ mode: "serial" });
const TITLE = "קורס בדיקה E2E";

test("create, edit with autosave and undo, publish, and assign a learner", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "editor is desktop-first; shared state");
  test.setTimeout(90_000);
  await login(page, "admin");
  await page.getByRole("link", { name: "קורסים" }).click();
  await page.getByLabel("קורס חדש").fill(TITLE);
  await page.getByRole("button", { name: "יצירת קורס" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/c-[a-f0-9]+$/);
  const courseUrl = page.url();
  await expect(page.getByRole("textbox", { name: "שם הקורס" })).toHaveValue(TITLE);
  await expect(page.getByText("כל השינויים נשמרו")).toBeVisible();

  // Add a question screen
  await page.getByRole("button", { name: "+ מסך" }).click();
  await page.getByRole("button", { name: /^שאלה/ }).click();
  await expect(page.locator(".ed-props").getByLabel("שם המסך")).toHaveValue("שאלה");
  await expect(page.locator(".mp-player .mp-prompt")).toHaveText("השאלה כאן");

  // Edit the prompt: saved only after the server confirms
  await page.getByRole("button", { name: /שאלת בחירה/ }).click();
  const prompt = page.locator(".ed-props").getByLabel("השאלה");
  await prompt.fill("כמה זה 2+2?");
  await expect(page.locator(".mp-player .mp-prompt")).toHaveText("כמה זה 2+2?");
  await expect(page.getByText("כל השינויים נשמרו")).toBeVisible({ timeout: 10_000 });

  // Undo / redo
  await page.getByRole("button", { name: "ביטול (Ctrl+Z)" }).click();
  await expect(page.locator(".ed-props").getByLabel("השאלה")).toHaveValue("השאלה כאן");
  await page.getByRole("button", { name: "חזרה (Ctrl+Y)" }).click();
  await expect(page.locator(".ed-props").getByLabel("השאלה")).toHaveValue("כמה זה 2+2?");
  await expect(page.getByText("כל השינויים נשמרו")).toBeVisible({ timeout: 10_000 });

  // Persisted on the server
  await page.reload();
  await page.getByRole("button", { name: /^2\s*שאלה/ }).click();
  await expect(page.locator(".mp-player .mp-prompt")).toHaveText("כמה זה 2+2?");
  await page.screenshot({ path: "test-results/screens/editor-desktop.png" });

  // Stale revision is rejected (another tab / editor saved meanwhile)
  const id = courseUrl.split("/").pop()!;
  const stale = await page.request.put(`/api/studio/courses/${id}/draft`, { data: { content: {}, baseRevision: 1 } });
  expect([409, 422]).toContain(stale.status());

  // Publish
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText(/גרסה 1 פורסמה/)).toBeVisible();

  // Assign a learner
  await page.goto("/studio/courses");
  await page.getByRole("row", { name: new RegExp(TITLE) }).getByRole("link", { name: "לומדים" }).click();
  await page.getByLabel("שיוך לומד לפי אימייל").fill(USERS.learner.email);
  await page.getByRole("button", { name: "שיוך לקורס" }).click();
  await expect(page.getByText("הלומד שויך לקורס.")).toBeVisible();
  await expect(page.getByRole("cell", { name: USERS.learner.email })).toBeVisible();

  // The learner now sees it
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await login(lp, "learner");
  await expect(lp.getByRole("heading", { name: TITLE })).toBeVisible();
  await ctx.close();
});

test("permissions are enforced on the editor API", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "API checks run once");
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, "learner");
  await expect(p).toHaveURL(/\/learn$/);
  expect((await p.request.post("/api/studio/courses", { data: { title: "פריצה" } })).status()).toBe(403);
  expect((await p.request.put("/api/studio/courses/c-x/draft", { data: { content: {}, baseRevision: 1 } })).status()).toBe(403);
  await ctx.close();

  const ectx = await browser.newContext();
  const ep = await ectx.newPage();
  await login(ep, "editor");
  await expect(ep).toHaveURL(/\/studio$/);
  expect((await ep.request.post("/api/studio/courses/c-x/publish", { data: { medicalConfirmed: false } })).status()).toBe(403);
  await ectx.close();
});
