import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test.describe.configure({ mode: "serial" });

test("admin creates a learner, enrolls their organization, resets the password and disables the account", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  test.setTimeout(90_000);
  await loginAs(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/studio$/);
  await page.getByRole("link", { name: "משתמשים" }).click();

  await page.getByLabel("שם מלא").fill("לומדת חדשה");
  await page.getByLabel("אימייל").fill("new.learner@e2e.test");
  await page.getByLabel("ארגון").selectOption({ label: "ארגון בדיקה" });
  await page.getByRole("button", { name: "יצירת משתמש" }).click();
  const pass1 = (await page.locator(".reveal-pass").textContent())!.trim();
  expect(pass1).toMatch(/^[A-Za-z0-9]{12}$/);
  await expect(page.getByRole("cell", { name: "new.learner@e2e.test" })).toBeVisible();

  // The new learner can sign in with the temporary password
  const c1 = await browser.newContext();
  const p1 = await c1.newPage();
  await loginAs(p1, "new.learner@e2e.test", pass1);
  await expect(p1).toHaveURL(/\/learn$/);
  await expect(p1.getByText("עדיין לא שויכו אליך קורסים")).toBeVisible();

  // Enroll the whole organization in a published course
  await page.getByRole("link", { name: "ארגונים" }).click();
  await page.getByRole("link", { name: "ארגון בדיקה" }).click();
  await expect(page.getByRole("cell", { name: "new.learner@e2e.test" })).toBeVisible();
  await page.getByRole("checkbox", { name: "הדגמת נגן MOZES LIFE" }).check();
  await page.getByRole("button", { name: "מתן גישה" }).click();
  await expect(page.getByText("הגישה נוספה.")).toBeVisible();
  await p1.reload();
  await expect(p1.getByRole("heading", { name: "הדגמת נגן MOZES LIFE" })).toBeVisible();

  // Reset password: the old one stops working, sessions are revoked
  await page.getByRole("link", { name: "לומדת חדשה" }).click();
  // The administrator types the new password themselves
  await page.getByRole("button", { name: "איפוס סיסמה" }).click();
  await page.getByLabel("אקליד בעצמי").check();
  await page.getByLabel("הסיסמה (לפחות 6 תווים)").fill("short");
  await page.getByRole("button", { name: "שמירת סיסמה" }).click();
  await expect(page.getByText("הסיסמה צריכה להכיל לפחות 6 תווים.")).toBeVisible();
  const pass2 = "Typed-by-admin-42";
  await page.getByLabel("הסיסמה (לפחות 6 תווים)").fill(pass2);
  await page.getByRole("button", { name: "שמירת סיסמה" }).click();
  await expect(page.locator(".reveal-pass")).toHaveText(pass2);
  await p1.reload();
  await expect(p1).toHaveURL(/\/login$/);
  await loginAs(p1, "new.learner@e2e.test", pass1);
  await expect(p1.locator(".form-error")).toBeVisible();
  await loginAs(p1, "new.learner@e2e.test", pass2);
  await expect(p1).toHaveURL(/\/learn$/);

  // Disable: signed out immediately and cannot sign back in
  await page.getByRole("button", { name: "השבתת החשבון" }).click();
  await page.getByRole("button", { name: "השבתה", exact: true }).click();
  await expect(page.getByText("החשבון הושבת.")).toBeVisible();
  await p1.reload();
  await expect(p1).toHaveURL(/\/login$/);
  await c1.close();

  // Admin cannot disable themselves
  await page.goto("/studio/users");
  await page.getByRole("link", { name: USERS.admin.name }).click();
  await expect(page.getByRole("button", { name: "השבתת החשבון" })).toHaveCount(0);
});

test("only system administrators can manage users and organizations", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "run once");
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await loginAs(p, USERS.editor.email, USERS.editor.password);
  await expect(p).toHaveURL(/\/studio$/);
  await expect(p.getByRole("link", { name: "משתמשים" })).toHaveCount(0);
  await p.goto("/studio/users");
  await expect(p.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
  expect((await p.request.post("/api/studio/users", { data: { name: "x y", email: "x@e2e.test", roles: ["super_admin"] } })).status()).toBe(403);
  expect((await p.request.post("/api/studio/orgs", { data: { name: "ארגון", type: "company" } })).status()).toBe(403);
  await ctx.close();
});

test("a learner created without an organization can use the Academy, and the 403 screen has a way out", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  await loginAs(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/users");
  await page.getByLabel("שם מלא").fill("לומד פרטי");
  await page.getByLabel("אימייל").fill("private.learner@e2e.test");
  await page.getByLabel("ארגון").selectOption({ label: "ללא ארגון" });
  await page.getByRole("button", { name: "יצירת משתמש" }).click();
  const pass = (await page.locator(".reveal-pass").textContent())!.trim();

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await loginAs(p, "private.learner@e2e.test", pass);
  await expect(p).toHaveURL(/\/learn$/);
  await expect(p.getByRole("heading", { name: "הקורסים שלי" })).toBeVisible();
  await expect(p.getByText("אין לך הרשאה לאזור הזה")).toHaveCount(0);

  await p.goto("/studio");
  await expect(p.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
  await p.getByRole("button", { name: "התנתקות" }).click();
  await expect(p).toHaveURL(/\/login$/);
  await ctx.close();
});
