import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS[who].email);
  await page.getByLabel("סיסמה").fill(USERS[who].password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

const SCO = `<!doctype html><html><head><meta charset="utf-8"><title>SCO</title></head><body>
<h1 id="h">לומדת בדיקה מיובאת</h1><button id="pass">סיום עם ציון 90</button><p id="st"></p>
<script>
function findAPI(w){ for (var i = 0; i < 10 && w; i++) { if (w.API) return w.API; if (w.parent === w) break; w = w.parent; } return null; }
var api = findAPI(window);
document.getElementById("st").textContent = api ? "init:" + api.LMSInitialize("") : "no api";
document.getElementById("h").dataset.learner = api ? api.LMSGetValue("cmi.core.student_name") : "";
document.getElementById("h").dataset.resume = api ? api.LMSGetValue("cmi.suspend_data") : "";
var leak; try { leak = String(window.top.document.cookie); } catch (e) { leak = "blocked"; }
document.getElementById("h").dataset.top = leak;
document.getElementById("pass").onclick = function () {
  api.LMSSetValue("cmi.core.score.raw", "90");
  api.LMSSetValue("cmi.core.lesson_status", "passed");
  api.LMSSetValue("cmi.suspend_data", "page=3");
  api.LMSCommit("");
  document.getElementById("st").textContent = "done";
};
</script></body></html>`;

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="m" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
<organizations default="o"><organization identifier="o"><title>לומדת SCORM לדוגמה</title><item identifier="i" identifierref="r"><title>שיעור</title></item></organization></organizations>
<resources><resource identifier="r" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`;

function buildZip(): string {
  const dir = path.resolve("test-results", "fixtures");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "scorm12-sample.zip");
  execFileSync("python3", ["-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)\nz.writestr('imsmanifest.xml',sys.argv[2])\nz.writestr('index.html',sys.argv[3])\nz.close()", out, MANIFEST, SCO]);
  return out;
}

test.describe.configure({ mode: "serial" });

test("import a SCORM 1.2 package, preview it in isolation, publish, and record the learner's score", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "shared state; run once");
  test.setTimeout(120_000);
  await login(page, "admin");
  await page.getByRole("link", { name: "ייבוא לומדה" }).click();
  await page.getByLabel("בחירת קובץ ZIP לייבוא").setInputFiles(buildZip());

  // Step 2: compatibility report
  await expect(page.getByRole("heading", { name: "דוח תאימות" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("נתמך להפעלה בלבד")).toBeVisible();
  await expect(page.getByText("SCORM 1.2", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/import-report.png" });
  await page.getByRole("button", { name: "המשך לתצוגה מקדימה" }).click();

  // Step 3: preview runs from another origin, with the SCORM API available
  const preview = page.frameLocator("iframe[title='תצוגה מקדימה של הלומדה']").frameLocator("#sco");
  await expect(preview.getByRole("heading", { name: "לומדת בדיקה מיובאת" })).toBeVisible({ timeout: 15_000 });
  await expect(preview.locator("#st")).toHaveText("init:true");
  await expect(preview.locator("#h")).toHaveAttribute("data-top", "blocked");
  const src = await page.locator("iframe[title='תצוגה מקדימה של הלומדה']").getAttribute("src");
  expect(new URL(src!).origin).not.toBe(new URL(page.url()).origin);
  await page.getByRole("button", { name: "המשך להגדרות" }).click();

  // Step 4: create as draft, then publish explicitly
  await expect(page.getByLabel("שם הקורס")).toHaveValue("לומדת SCORM לדוגמה");
  await page.getByRole("button", { name: "יצירת קורס כטיוטה" }).click();
  await expect(page).toHaveURL(/\/studio\/courses\/c-/);
  await expect(page.getByText("טיוטה", { exact: true })).toBeVisible();
  await page.getByLabel(/הקורס מעניק תעודה/).check();
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText(/הקורס פורסם \(גרסה 1\)/)).toBeVisible();
  await page.getByRole("link", { name: "גישה ולומדים" }).click();
  await page.getByLabel("רשימת אנשים — אחד בכל שורה").fill(USERS.learner.email);
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByText(/כבר היו במערכת/)).toBeVisible();

  // Learner: SCORM data reaches the server and the score is recorded
  const ctx = await browser.newContext();
  const lp = await ctx.newPage();
  await login(lp, "learner");
  await lp.locator(".course-card", { hasText: "לומדת SCORM לדוגמה" }).getByRole("link").click();
  const sco = lp.frameLocator("iframe.pkg-frame").frameLocator("#sco");
  await expect(sco.locator("#h")).toHaveAttribute("data-learner", USERS.learner.name, { timeout: 15_000 });
  await sco.getByRole("button", { name: "סיום עם ציון 90" }).click();
  await expect(lp.getByText("ההתקדמות נשמרה")).toBeVisible({ timeout: 10_000 });
  await lp.getByRole("link", { name: "הקורסים שלי" }).click();
  const card = lp.locator(".course-card", { hasText: "לומדת SCORM לדוגמה" });
  await expect(card.getByText("עבר בהצלחה")).toBeVisible();
  await expect(card.getByText("90%", { exact: true })).toBeVisible();

  // A certificate is issued for the passed (non-demo) course and verifiable without signing in
  await lp.getByRole("link", { name: "צפייה בתעודה: לומדת SCORM לדוגמה" }).click();
  await expect(lp.getByRole("heading", { name: USERS.learner.name })).toBeVisible();
  await expect(lp.getByText("לומדת SCORM לדוגמה")).toBeVisible();
  await expect(lp.getByText("90%")).toBeVisible();
  const certUrl = lp.url();
  expect(certUrl).toMatch(/\/certificates\/ML-[A-Z0-9]{10}$/);
  const anonCert = await browser.newContext();
  const ap = await anonCert.newPage();
  await ap.goto(certUrl);
  await expect(ap.getByRole("heading", { name: USERS.learner.name })).toBeVisible();
  expect((await ap.goto(certUrl.replace(/ML-[A-Z0-9]{10}$/, "ML-AAAAAAAAAA")))?.status()).toBe(404);
  await anonCert.close();
  await lp.goto("/learn");

  // Resume: saved suspend_data is handed back to the courseware
  await card.getByRole("link").click();
  await expect(lp.frameLocator("iframe.pkg-frame").frameLocator("#sco").locator("#h")).toHaveAttribute("data-resume", "page=3", { timeout: 15_000 });
  await ctx.close();
});

test("rejects a malicious archive with a clear report", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "run once");
  await login(page, "admin");
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio/import");
  const dir = path.resolve("test-results", "fixtures");
  mkdirSync(dir, { recursive: true });
  const evil = path.join(dir, "evil.zip");
  execFileSync("python3", ["-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('index.html','x')\nz.writestr('../../escape.html','x')\nz.close()", evil]);
  await page.getByLabel("בחירת קובץ ZIP לייבוא").setInputFiles(evil);
  await expect(page.getByText("אינו נתמך", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/נתיב קובץ לא חוקי|נתיבי קבצים לא חוקיים/)).toBeVisible();
  await expect(page.getByRole("button", { name: "ייבוא קובץ אחר" })).toBeVisible();
});
