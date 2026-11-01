import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test.describe.configure({ mode: "serial" });

test("organization admin: progress report, CSV export, seat limit and isolation from other organizations", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once (uses the organization from licenses.spec)");
  test.setTimeout(120_000);
  await loginAs(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/orgs");
  await page.getByRole("link", { name: "מגדל השלום" }).click();
  await expect(page).toHaveURL(/\/studio\/orgs\/[\w-]{20,}$/);
  const orgId = page.url().split("/").pop()!;

  // MOZES staff: add a manager and set a seat limit of 3 (2 members + the manager)
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill("ועד הבית, manager@e2e.test");
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  const pass = (await page.locator(".bulk-results .reveal-pass").first().textContent())!.trim();
  await page.getByLabel("אימייל של משתמש קיים").fill("manager@e2e.test");
  await page.getByLabel("תפקיד בארגון").selectOption({ label: "מנהל/ת ארגון" });
  await page.getByRole("button", { name: "הוספת חבר" }).click();
  await expect(page.getByText("המשתמש נוסף לארגון.")).toBeVisible();
  await page.getByLabel("מספר משתמשים מרבי (ריק = ללא הגבלה)").fill("3");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByText("המכסה עודכנה.")).toBeVisible();

  // The manager reaches their area from the learner home
  const ctx = await browser.newContext();
  const mp = await ctx.newPage();
  await loginAs(mp, "manager@e2e.test", pass);
  await expect(mp).toHaveURL(/\/learn$/);
  await mp.getByRole("link", { name: "ניהול הארגון" }).click();
  await expect(mp).toHaveURL(new RegExp(`/org/${orgId}$`));
  await expect(mp.getByRole("heading", { name: "מגדל השלום" })).toBeVisible();
  await expect(mp.getByText("3/3")).toBeVisible();
  await expect(mp.getByRole("row", { name: /ronit@e2e.test/ })).toBeVisible();
  await expect(mp.getByRole("columnheader", { name: "הדגמת נגן MOZES LIFE" })).toBeVisible();

  // Excel report
  const csv = await mp.request.get(`/api/org/${orgId}/report.csv`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("ronit@e2e.test");

  // Seat limit is enforced (all-or-nothing)
  await mp.getByLabel("רשימת אנשים — אחד בכל שורה").fill("extra@e2e.test");
  await mp.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(mp.getByText(/חריגה ממכסת המשתמשים של הארגון/)).toBeVisible();

  // Password reset for a member who belongs only to this organization
  await mp.getByRole("row", { name: /ronit@e2e.test/ }).getByRole("button", { name: /איפוס סיסמה/ }).click();
  await mp.getByRole("button", { name: "שמירת סיסמה" }).click(); // random is the default
  await expect(mp.locator(".reveal-pass")).toHaveText(/^[A-Za-z0-9]{12}$/);

  // Isolation: other organizations and Studio are off limits
  await page.goto("/studio/orgs");
  await page.getByRole("link", { name: "ארגון בדיקה" }).click();
  await expect(page).toHaveURL(/\/studio\/orgs\/[\w-]{20,}$/);
  const otherId = page.url().split("/").pop()!;
  await mp.goto(`/org/${otherId}`);
  await expect(mp.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
  expect((await mp.request.get(`/api/org/${otherId}/report.csv`)).status()).toBe(403);
  expect((await mp.request.post(`/api/org/${otherId}/people`, { data: { text: "x@e2e.test" } })).status()).toBe(403);
  await mp.goto("/studio");
  await expect(mp.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
  await ctx.close();

  // A regular learner has no organization area
  const lctx = await browser.newContext();
  const lp = await lctx.newPage();
  await loginAs(lp, USERS.learner.email, USERS.learner.password);
  await expect(lp).toHaveURL(/\/learn$/);
  await expect(lp.getByRole("link", { name: "ניהול הארגון" })).toHaveCount(0);
  await lp.goto("/org");
  await expect(lp.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
  await lctx.close();
});
