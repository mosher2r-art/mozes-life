import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

// One shared enrollment: run these in order.
test.describe.configure({ mode: "serial" });

test("learner progress is saved on the server and resumed after reload", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "state is shared; run once");
  await login(page, "learner");
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByText("עדיין לא שויכו אליך קורסים")).toHaveCount(0);

  await page.getByRole("link", { name: "התחלת הקורס" }).click();
  await expect(page).toHaveURL(/\/learn\/c\/[\w-]+$/);
  await expect(page.getByText("קורס הדגמה · לא רפואי")).toBeVisible();

  await page.getByRole("button", { name: "המשך", exact: true }).click();
  await expect(page.locator("#mp-screen-title")).toHaveText("מסך טקסט והסבר");
  await expect(page.getByText("ההתקדמות נשמרה")).toBeVisible();
  await page.getByRole("button", { name: "המשך", exact: true }).click();
  await expect(page.locator("#mp-screen-title")).toHaveText("מסך תמונה וטקסט");
  await expect(page.getByText("ההתקדמות נשמרה")).toBeVisible();

  await page.reload();
  await expect(page.locator("#mp-screen-title")).toHaveText("מסך תמונה וטקסט");

  await page.getByRole("link", { name: "הקורסים שלי" }).click();
  await expect(page.getByText("ממשיכים מאיפה שעצרת")).toBeVisible();
  await expect(page.getByText("בתהליך").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/academy-home-desktop.png", fullPage: true });
});

test("the server rejects invalid or out-of-order events and other users' enrollments", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "state is shared; run once");
  await login(page, "learner");
  const href = await page.getByRole("link", { name: "המשך ללמוד" }).first().getAttribute("href");
  const id = href!.split("/").pop()!;
  const api = `/api/learn/enrollments/${id}/events`;

  expect((await page.request.post(api, { data: { events: [{ type: "hack" }] } })).status()).toBe(400);
  expect((await page.request.post(api, { data: { events: [{ type: "answer", componentId: "q1", response: { type: "trueFalse", value: true } }] } })).status()).toBe(409);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await login(p2, "editor");
  await expect(p2).toHaveURL(/\/studio$/);
  expect((await p2.request.post(api, { data: { events: [{ type: "continue" }] } })).status()).toBe(404);
  const res = await p2.goto(`/learn/c/${id}`);
  expect(res?.status()).toBe(404);
  await other.close();

  const anon = await browser.newContext();
  expect((await anon.request.post(new URL(api, page.url()).toString(), { data: { events: [{ type: "continue" }] } })).status()).toBe(401);
  await anon.close();
});

test("course page fits the phone screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "layout check for phones");
  await login(page, "learner");
  await page.locator(".course-card", { hasText: "הדגמת נגן MOZES LIFE" }).getByRole("link").click();
  await page.waitForSelector(".mp-player");
  for (let i = 0; i < 3; i++) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const next = page.getByRole("button", { name: "המשך", exact: true });
    if ((await next.count()) && (await next.isEnabled())) await next.click();
    else break;
  }
});
