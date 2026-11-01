import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test.describe.configure({ mode: "serial" });
const card = (p: Page, title: string) => p.locator(".course-card", { hasText: title });

test("organization: paste a list of people, grant several courses at once, and control access by dates", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  test.setTimeout(120_000);
  await loginAs(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/studio$/);

  // New organization
  await page.goto("/studio/orgs");
  await page.getByLabel("שם הארגון").fill("מגדל השלום");
  await page.getByLabel("סוג").selectOption({ label: "בניין מגורים" });
  await page.getByRole("button", { name: "יצירת ארגון" }).click();
  await expect(page.getByRole("heading", { name: "מגדל השלום" })).toBeVisible();

  // Paste people the way they come from Excel: name<TAB>email, plus one invalid line
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill("רונית כהן\tronit@e2e.test\nאבי לוי, avi@e2e.test\nזה לא אימייל");
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  const results = page.locator(".bulk-results");
  await expect(results).toContainText("2 חשבונות חדשים");
  await expect(results).toContainText("1 שורות לא תקינות");
  await expect(page.getByRole("link", { name: "הורדת פרטי הכניסה (CSV)" })).toBeVisible();
  const ronitPass = (await results.getByRole("row", { name: /ronit@e2e.test/ }).locator(".reveal-pass").textContent())!.trim();

  // Grant two courses at once for 3 months (default)
  await page.getByRole("checkbox", { name: "הדגמת נגן MOZES LIFE" }).check();
  await page.getByRole("checkbox", { name: "קורס בדיקה E2E" }).check();
  await page.getByRole("button", { name: "מתן גישה" }).click();
  await expect(page.getByText("הגישה נוספה.")).toBeVisible();
  const grants = page.locator("section", { has: page.getByRole("heading", { name: "קורסים לארגון" }) }).getByRole("table");
  await expect(grants.getByRole("row")).toHaveCount(3); // header + 2

  // The member sees both courses with the end date
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await loginAs(lp, "ronit@e2e.test", ronitPass);
  await expect(lp).toHaveURL(/\/learn$/);
  await expect(card(lp, "הדגמת נגן MOZES LIFE").getByText(/^גישה עד /)).toBeVisible();
  await expect(card(lp, "קורס בדיקה E2E").getByRole("link")).toBeVisible();
  const enrollmentHref = await card(lp, "קורס בדיקה E2E").getByRole("link").getAttribute("href");

  // Cancelling the grant closes the course immediately — in the UI and on the server
  await grants.getByRole("row", { name: /קורס בדיקה E2E/ }).getByRole("button", { name: "ביטול" }).click();
  await page.getByRole("button", { name: "ביטול גישה" }).click();
  await expect(grants.getByRole("row", { name: /קורס בדיקה E2E/ }).getByText("בוטל")).toBeVisible();
  await lp.reload();
  await expect(card(lp, "קורס בדיקה E2E").getByText(/הגישה לקורס הסתיימה/)).toBeVisible();
  await expect(card(lp, "קורס בדיקה E2E").getByRole("link")).toHaveCount(0);
  expect((await lp.goto(enrollmentHref!))?.status()).toBe(404);
  const id = enrollmentHref!.split("/").pop();
  expect((await lp.request.post(`/api/learn/enrollments/${id}/events`, { data: { events: [{ type: "continue" }] } })).status()).toBe(404);
  await ctx.close();
});

test("private learners: access that starts in the future is shown but locked", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  await loginAs(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/courses");
  await page.getByRole("row", { name: /קורס בדיקה E2E/ }).getByRole("link", { name: "גישה ולומדים" }).click();

  const form = page.locator("form", { has: page.getByRole("heading", { name: "לומדים פרטיים — הדבקת רשימה" }) });
  await form.getByLabel("רשימת אנשים — אחד בכל שורה").fill("future@e2e.test");
  await form.getByLabel("מתאריך").fill("2099-01-01");
  await form.getByLabel("משך הגישה").selectOption({ label: "ללא הגבלה" });
  await form.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(form.locator(".bulk-results")).toContainText("1 חשבונות חדשים");
  const pass = (await form.locator(".reveal-pass").last().textContent())!.trim();
  await expect(page.getByRole("row", { name: /future@e2e.test/ }).getByText("עתידי")).toBeVisible();

  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await loginAs(lp, "future@e2e.test", pass);
  await expect(card(lp, "קורס בדיקה E2E").getByText(/הקורס ייפתח ב-/)).toBeVisible();
  await expect(card(lp, "קורס בדיקה E2E").getByRole("link")).toHaveCount(0);
  await ctx.close();
});
