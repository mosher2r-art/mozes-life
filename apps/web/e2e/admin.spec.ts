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
  await page.getByLabel("קורס").selectOption({ label: "הדגמת נגן MOZES LIFE" });
  await page.getByRole("button", { name: "שיוך", exact: true }).click();
  await expect(page.getByText(/חברי ארגון שויכו לקורס/)).toBeVisible();
  await p1.reload();
  await expect(p1.getByRole("heading", { name: "הדגמת נגן MOZES LIFE" })).toBeVisible();

  // Reset password: the old one stops working, sessions are revoked
  await page.getByRole("link", { name: "לומדת חדשה" }).click();
  await page.getByRole("button", { name: "איפוס סיסמה" }).click();
  const pass2 = (await page.locator(".reveal-pass").textContent())!.trim();
  expect(pass2).not.toBe(pass1);
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
