import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectNoA11yViolations(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  // A decorative infinite shimmer has no final frame. Wait for finite UI
  // transitions, then run the same full WCAG checks on the rendered page.
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).every((a) => a.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
}

test.describe("anonymous", () => {
  test("login page is Hebrew RTL, accessible, shows the logo", async ({ page }, info) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "כניסה לחשבון" })).toBeVisible();
    await expect(page.getByAltText("MOZES LIFE — לומדים להציל חיים")).toBeVisible();
    await expect(page.getByRole("link", { name: "MOZES LIFE — לדף הבית", exact: true })).toHaveAttribute("href", "/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".auth-brand")).toHaveCSS("animation-name", "none", { pseudo: "after" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "התחברות", exact: true }).hover();
    await expectNoA11yViolations(page);
    await page.screenshot({ path: `test-results/screens/login-${info.project.name}.png`, fullPage: true });
  });

  test("protected pages redirect to login", async ({ page }) => {
    for (const path of ["/studio", "/learn", "/"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("protected API returns 401", async ({ request }) => {
    const res = await request.get("/api/studio/me");
    expect(res.status()).toBe(401);
  });

  test("public sign-up is disabled", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: { email: "intruder@e2e.test", password: "Intruder-123456", name: "x" },
    });
    expect(res.ok()).toBe(false);
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("אימייל").fill(USERS.admin.email);
    await page.getByLabel("סיסמה").fill("wrong-password-1");
    await page.getByRole("button", { name: "התחברות" }).click();
    await expect(page.locator(".form-error")).toHaveText("האימייל או הסיסמה שגויים.");
    await expect(page.locator(".form-error")).toHaveAttribute("role", "alert");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("super_admin", () => {
  test("lands in Studio with a live DB status and can call Studio API", async ({ page }, info) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { name: `שלום, ${USERS.admin.name}` })).toBeVisible();
    await expect(page.getByText("מחובר", { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
    await page.screenshot({ path: `test-results/screens/studio-${info.project.name}.png`, fullPage: true });

    const res = await page.request.get("/api/studio/me");
    expect(res.status()).toBe(200);
    expect((await res.json()).platformRoles).toEqual(["super_admin"]);
  });

  test("sign out ends the session", async ({ page }) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/studio$/);
    await page.getByRole("button", { name: "התנתקות" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/studio/me")).status()).toBe(401);
  });
});

test.describe("editor", () => {
  test("can enter Studio", async ({ page }) => {
    await login(page, "editor");
    await expect(page).toHaveURL(/\/studio$/);
    expect((await page.request.get("/api/studio/me")).status()).toBe(200);
  });
});

test.describe("learner", () => {
  test("lands in Academy with their enrolled courses", async ({ page }, info) => {
    await login(page, "learner");
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole("heading", { name: "הקורסים שלי" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "הדגמת נגן MOZES LIFE" }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
    await page.screenshot({ path: `test-results/screens/learn-${info.project.name}.png`, fullPage: true });
  });

  test("is blocked from Studio in the UI and in the API", async ({ page }) => {
    await login(page, "learner");
    await expect(page).toHaveURL(/\/learn$/);
    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
    await expect(page.getByRole("link", { name: "לוח בקרה" })).toHaveCount(0);
    expect((await page.request.get("/api/studio/me")).status()).toBe(403);
  });
});
