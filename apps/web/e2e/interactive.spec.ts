import { expect, test } from "@playwright/test";
import { USERS } from "./fixtures";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEF8AAAAASUVORK5CYII=";
const file = {
  format: "mozes-interactive-chapter", version: 1,
  chapter: { name: "תאימות JSON אינטראקטיבי", description: "בדיקת תוכנה בלבד", pages: [
    { type: "scene", title: "פתיחה", objects: [
      { id: "img", kind: "image", x: 5, y: 5, w: 90, h: 30, src: image, alt: "תמונה מוטמעת", opacity: 0, animation: "Pulse" },
      { id: "next", kind: "button", x: 10, y: 80, w: 80, h: 10, text: "הצגת התוכן" },
    ], states: [{ changes: [] }, { changes: [{ id: "img", opacity: 1, duration: 100 }] }] },
    { type: "scene", title: "גרירה", objects: [
      { id: "good", kind: "drag", x: 5, y: 10, w: 40, h: 15, text: "תשובה נכונה" },
      { id: "bad", kind: "drag", x: 5, y: 35, w: 40, h: 15, text: "תשובה אחרת" },
      { id: "target", kind: "drop", x: 55, y: 10, w: 40, h: 20, text: "יעד", accept: "good" },
      { id: "next", kind: "button", x: 10, y: 80, w: 80, h: 10, text: "סיום הלומדה" },
    ], states: [] },
  ] },
};

test("original interactive JSON imports, plays, validates matching and exports in its original format", async ({ page }, info) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS.admin.email);
  await page.getByLabel("סיסמה").fill(USERS.admin.password);
  await page.getByRole("button", { name: "התחברות", exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/chapters");
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/studio/chapters/import") && r.request().method() === "POST");
  const imported = { ...file, chapter: { ...file.chapter, name: `${file.chapter.name} ${info.project.name}` } };
  await page.getByLabel("בחירת קובצי פרקים לייבוא").setInputFiles({ name: "interactive.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.results[0].ok).toBe(true);
  const id = body.results[0].chapters[0].id;
  await page.goto(`/studio/chapters/${id}`);
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "תצוגה מקדימה", exact: true });
  const scene = preview.getByTestId("interactive-scene");
  await expect(scene.locator("img")).toHaveCSS("opacity", "0");
  await scene.getByRole("button", { name: "הצגת התוכן", exact: true }).click();
  await expect(scene.locator("img")).toHaveCSS("opacity", "1");
  await scene.getByRole("button", { name: "הצגת התוכן", exact: true }).click();
  await expect(scene).toHaveAttribute("aria-label", "גרירה");
  const target = scene.getByRole("button", { name: /^יעד/ });
  await expect(scene.getByRole("button", { name: "סיום הלומדה", exact: true })).toBeDisabled();
  await scene.getByRole("button", { name: "תשובה אחרת", exact: true }).click();
  await target.click();
  await expect(preview.getByText("ההתאמה אינה נכונה. נסו שוב.", { exact: true })).toBeVisible();
  const good = scene.getByRole("button", { name: "תשובה נכונה", exact: true });
  if (info.project.name === "desktop") {
    const a = await good.boundingBox(), b = await target.boundingBox();
    if (!a || !b) throw new Error("Missing drag target");
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
  } else { await good.tap(); await target.tap(); }
  await expect(preview.getByText("התאמה נכונה.", { exact: true })).toBeVisible();
  await scene.getByRole("button", { name: "סיום הלומדה", exact: true }).click();
  await expect(preview.locator(".mp-result")).toBeVisible();
  const exported = await page.request.get(`/api/studio/chapters/${id}/export`);
  const original = await exported.json();
  expect(original.format).toBe("mozes-interactive-chapter");
  expect(original.chapter.pages).toHaveLength(2);
  expect(original.chapter.pages[0].objects[0].src).toBe(image);
  const importedAgain = await page.request.post("/api/studio/chapters/import", { data: { files: [{ name: "roundtrip.json", text: JSON.stringify(original) }] } });
  expect((await importedAgain.json()).results[0].ok).toBe(true);
});
