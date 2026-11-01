import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test.describe.configure({ mode: "serial" });
const LESSON = "שיעור בדיקה E2E";
const EXAM = "מבחן בדיקה E2E";
const TITLE = "קורס בדיקה E2E";
const saved = (page: Page) => expect(page.getByText("כל השינויים נשמרו")).toBeVisible({ timeout: 10_000 });

async function newChapter(page: Page, title: string, kind: "שיעור" | "מבחן") {
  await page.goto("/studio/chapters");
  await page.getByLabel("שם הפרק").fill(title);
  await page.getByRole("radio", { name: kind }).check();
  await page.getByRole("button", { name: "יצירת פרק" }).click();
  await expect(page).toHaveURL(/\/studio\/chapters\/ch-[a-f0-9]+$/);
  await expect(page.getByRole("textbox", { name: "שם הפרק" })).toHaveValue(title);
  await expect(page.getByRole("group", { name: "סוג הפרק" }).getByRole("button", { name: kind })).toHaveAttribute("aria-pressed", "true");
  // Add a question screen from the screen picker
  await page.getByRole("button", { name: "+ הוספת מסך" }).first().click();
  await page.getByRole("dialog", { name: "הוספת מסך" }).getByRole("button", { name: /^שאלה/ }).click();
  await expect(page.locator(".ed-main").getByLabel("שם המסך")).toHaveValue("שאלה");
  await saved(page);
  return page.url();
}

test("chapter bank: build a chapter with autosave, undo, preview and conflict protection", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "editor is desktop-first; shared state");
  test.setTimeout(90_000);
  await login(page, "admin");
  await expect(page.getByRole("link", { name: "מאגר פרקים" })).toBeVisible();
  const url = await newChapter(page, LESSON, "שיעור");

  // Edit the prompt: "saved" only after the server confirms
  await page.getByRole("button", { name: /שאלת בחירה/ }).click();
  await page.locator(".ed-main").getByLabel("השאלה").fill("כמה זה 2+2?");
  await saved(page);

  // No live preview while editing; it opens on demand, on a phone or a computer
  await expect(page.locator(".mp-player")).toHaveCount(0);
  await page.getByRole("button", { name: "תצוגה מקדימה" }).click();
  const pv = page.getByRole("dialog", { name: "תצוגה מקדימה" });
  await expect(pv.locator(".device-mobile .mp-prompt")).toHaveText("כמה זה 2+2?");
  await pv.getByRole("button", { name: "מחשב" }).click();
  await expect(pv.locator(".device-desktop .mp-prompt")).toHaveText("כמה זה 2+2?");
  await pv.getByRole("button", { name: "מההתחלה" }).click();
  await expect(pv.locator(".device-desktop")).toContainText(LESSON);
  await page.screenshot({ path: "test-results/screens/chapter-preview.png" });
  await pv.getByRole("button", { name: "סגירה" }).click();
  await expect(pv).toHaveCount(0);

  // Undo / redo
  await page.getByRole("button", { name: "ביטול (Ctrl+Z)" }).click();
  await expect(page.locator(".ed-main").getByLabel("השאלה")).toHaveValue("השאלה כאן");
  await page.getByRole("button", { name: "חזרה (Ctrl+Y)" }).click();
  await expect(page.locator(".ed-main").getByLabel("השאלה")).toHaveValue("כמה זה 2+2?");
  await saved(page);

  // Persisted on the server
  await page.reload();
  await page.getByRole("button", { name: /^2\s*שאלה/ }).click();
  await page.getByRole("button", { name: /שאלת בחירה/ }).click();
  await expect(page.locator(".ed-main").getByLabel("השאלה")).toHaveValue("כמה זה 2+2?");
  await page.screenshot({ path: "test-results/screens/chapter-editor.png" });

  // A stale revision is rejected (another tab saved meanwhile)
  const id = url.split("/").pop()!;
  const stale = await page.request.put(`/api/studio/chapters/${id}`, { data: { content: {}, baseRevision: 1 } });
  expect([409, 422]).toContain(stale.status());
});

test("course from chapters: exam scoring, certificate with the course title", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  test.setTimeout(150_000);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/studio$/);
  await newChapter(page, EXAM, "מבחן");

  // Create a course and place both chapters from the bank
  await page.goto("/studio/courses");
  await page.getByLabel("קורס חדש").fill(TITLE);
  await page.getByRole("button", { name: "יצירת קורס" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/c-[a-f0-9]+$/);
  await expect(page.getByText("הקורס עדיין ריק")).toBeVisible();
  await page.getByRole("button", { name: "+ הוספת פרק" }).first().click();
  const dlg = page.getByRole("dialog", { name: "הוספת פרק לקורס" });
  await dlg.getByRole("checkbox", { name: new RegExp(LESSON) }).check();
  await dlg.getByRole("checkbox", { name: new RegExp(EXAM) }).check();
  await dlg.getByRole("button", { name: "הוספת 2 פרקים" }).click();
  await expect(page.locator(".cb-chapter")).toHaveCount(2);
  await expect(page.locator(".cb-chapter").first()).toContainText(LESSON);
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible();
  // An exam sets a default passing score
  await expect(page.getByLabel("ציון עובר במבחנים (%)")).toHaveValue("80");

  // The same chapter cannot appear twice
  const id = page.url().split("/").pop()!;
  const dup = await page.request.patch(`/api/studio/courses/${id}`, { data: { baseRevision: 999, chapterIds: ["a", "a"] } });
  expect(dup.status()).toBe(422);

  await page.getByLabel("הקורס מעניק תעודה").check();
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible();
  await expect(page.locator(".cert-preview")).toContainText(TITLE);

  // Preview of the whole course
  await page.getByRole("button", { name: "תצוגה מקדימה" }).click();
  await expect(page.getByRole("dialog", { name: "תצוגה מקדימה" }).locator(".mp-player")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/course-preview.png" });
  await page.getByRole("button", { name: "סגירה" }).click();
  await page.screenshot({ path: "test-results/screens/course-builder.png", fullPage: true });

  // Publish
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText(/גרסה 1 פורסמה/)).toBeVisible();

  // Assign the learner
  await page.getByRole("link", { name: "גישה ולומדים" }).click();
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill(USERS.learner.email);
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByText(/כבר היו במערכת/)).toBeVisible();

  // Learner: practice answers wrong (does not count), exam answer right → passes with 100%
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await login(lp, "learner");
  await lp.locator(".course-card", { hasText: TITLE }).getByRole("link").click();
  const next = () => lp.getByRole("button", { name: /^(המשך|סיום)$/ }).click();
  await next(); // lesson intro
  for (let i = 0; i < 2; i++) {
    await lp.getByLabel("תשובה שגויה").check();
    await lp.getByRole("button", { name: "בדיקה" }).click();
  }
  await next();
  await next(); // exam intro
  await lp.getByLabel("תשובה נכונה").check();
  await lp.getByRole("button", { name: "בדיקה" }).click();
  await next();
  await lp.getByRole("link", { name: "הקורסים שלי" }).click();
  const card = lp.locator(".course-card", { hasText: TITLE });
  await expect(card.getByText("עבר בהצלחה")).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText("100%", { exact: true })).toHaveCount(2); // progress and score
  await lp.getByRole("link", { name: `צפייה בתעודה: ${TITLE}` }).click();
  await expect(lp.getByText(TITLE)).toBeVisible();
  await expect(lp.getByRole("heading", { name: USERS.learner.name })).toBeVisible();
  await ctx.close();

  // A chapter used in a course cannot be deleted
  await page.goto("/studio/chapters");
  await expect(page.getByRole("row", { name: new RegExp(EXAM) }).getByRole("button", { name: /מחיקת/ })).toHaveCount(0);
});

test("chapters can be imported from files and exported again", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  await login(page, "admin");
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/chapters");
  const file = {
    schema: "mozes-chapter",
    schemaVersion: 1,
    title: "פרק מיובא E2E",
    kind: "lesson",
    screens: [{ id: "s1", title: "מסך מיובא", template: "text", slots: { body: [{ id: "h1", type: "heading", text: "שלום", level: 1 }] } }],
  };
  await page.getByLabel("בחירת קובצי פרקים לייבוא").setInputFiles([
    { name: "chapter.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) },
    { name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"something-else"}') },
  ]);
  await expect(page.getByText(/chapter.json.*יובאו פרק אחד/)).toBeVisible();
  await expect(page.getByText(/broken.json.*אינו פרק של MOZES/)).toBeVisible();
  await page.reload();
  const row = page.getByRole("row", { name: /פרק מיובא E2E/ });
  await expect(row).toBeVisible();

  // Export, then import the export: a second, independent copy with fresh ids
  const href = await row.getByRole("link", { name: "הורדה" }).getAttribute("href");
  const exported = await (await page.request.get(href!)).json();
  expect(exported).toMatchObject({ schema: "mozes-chapter", title: "פרק מיובא E2E" });
  expect(exported.screens[0].id).not.toBe("s1");
  const again = await page.request.post("/api/studio/chapters/import", { data: { files: [{ name: "x.json", text: JSON.stringify(exported) }] } });
  expect(again.status()).toBe(200);

  // Unused chapters can be deleted
  await page.reload();
  await page.getByRole("row", { name: /פרק מיובא E2E/ }).first().getByRole("button", { name: /מחיקת/ }).click();
  await page.getByRole("button", { name: /אישור מחיקת/ }).click();
  await expect(page.getByRole("row", { name: /פרק מיובא E2E/ })).toHaveCount(1);
});

test("permissions are enforced on the builder APIs", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "API checks run once");
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, "learner");
  await expect(p).toHaveURL(/\/learn$/);
  expect((await p.request.post("/api/studio/courses", { data: { title: "פריצה" } })).status()).toBe(403);
  expect((await p.request.post("/api/studio/chapters", { data: { title: "פריצה", kind: "lesson" } })).status()).toBe(403);
  expect((await p.request.put("/api/studio/chapters/ch-x", { data: { content: {}, baseRevision: 1 } })).status()).toBe(403);
  expect((await p.request.patch("/api/studio/courses/c-x", { data: { baseRevision: 1, title: "xx" } })).status()).toBe(403);
  expect((await p.request.post("/api/studio/chapters/import", { data: { files: [] } })).status()).toBe(403);
  await ctx.close();

  const ectx = await browser.newContext();
  const ep = await ectx.newPage();
  await login(ep, "editor");
  await expect(ep).toHaveURL(/\/studio$/);
  expect((await ep.request.post("/api/studio/courses/c-x/publish", { data: { medicalConfirmed: false } })).status()).toBe(403);
  await ectx.close();
});
