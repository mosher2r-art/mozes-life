import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { USERS } from "./fixtures";

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS.admin.email);
  await page.getByLabel("סיסמה").fill(USERS.admin.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).toHaveURL(/\/studio$/);
}

const cont = (page: Page) => page.getByRole("button", { name: "המשך", exact: true }).click();
const title = (page: Page) => page.locator("#mp-screen-title");

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include(".mp-player").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

/** Force the video's progress (headless Chromium may lack H.264). */
async function watchVideo(page: Page, percent: number) {
  await page.evaluate((pct) => {
    const v = document.querySelector<HTMLVideoElement>(".mp-player video");
    if (!v) throw new Error("no video");
    Object.defineProperty(v, "duration", { configurable: true, get: () => 10 });
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => (pct / 100) * 10, set: () => {} });
    v.dispatchEvent(new Event("timeupdate"));
  }, percent);
}

test("editor preview shows validation and plays the full demo course", async ({ page }, info) => {
  test.setTimeout(60_000);
  await loginAdmin(page);
  await page.getByRole("link", { name: "הדגמת נגן" }).click();
  await expect(page.getByRole("heading", { name: "הדגמת נגן", level: 1 })).toBeVisible();
  await expect(page.getByText("בדיקת תקינות טכנית אינה מהווה אישור רפואי.")).toBeVisible();
  await expect(page.getByText("הקורס תקין טכנית")).toBeVisible();

  const shot = (name: string) => page.screenshot({ path: `test-results/screens/player-${name}-${info.project.name}.png`, fullPage: true });

  // 1. Cinematic intro
  await expect(page.getByRole("heading", { name: "הדגמת נגן MOZES LIFE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "הקודם" })).toBeDisabled();
  await shot("intro");
  await axe(page);
  await cont(page);

  // 2. Text — focus moves to the new screen title
  await expect(title(page)).toHaveText("מסך טקסט והסבר");
  await expect(title(page)).toBeFocused();
  await cont(page);

  // 3. Media + text
  await expect(title(page)).toHaveText("מסך תמונה וטקסט");
  await expect(page.getByRole("img", { name: /תמונת אווירה מופשטת/ })).toBeVisible();
  await shot("media-text");
  await cont(page);

  // 4. Video requires 80%
  await expect(title(page)).toHaveText("מסך וידאו");
  await expect(page.getByRole("button", { name: "המשך", exact: true })).toBeDisabled();
  await expect(page.getByText("יש לצפות בסרטון כדי להמשיך")).toBeVisible();
  await watchVideo(page, 50);
  await expect(page.getByRole("button", { name: "המשך", exact: true })).toBeDisabled();
  await watchVideo(page, 85);
  await expect(page.getByRole("button", { name: "המשך", exact: true })).toBeEnabled();
  await cont(page);

  // 5. Single choice: wrong, then right
  await expect(title(page)).toHaveText("שאלת בחירה יחידה");
  await page.getByLabel("אדום").check();
  await page.getByRole("button", { name: "בדיקה" }).click();
  await expect(page.getByText("התשובה אינה נכונה. נותרו 1 ניסיונות")).toBeVisible();
  await page.getByLabel("ירוק").check();
  await page.getByRole("button", { name: "בדיקה" }).click();
  await expect(page.locator(".mp-feedback-status")).toHaveText("תשובה נכונה");
  await expect(page.getByLabel("ירוק")).toBeDisabled();
  await shot("question");
  await axe(page);
  await cont(page);

  // 6. Multiple choice
  await expect(title(page)).toHaveText("שאלת בחירה מרובה");
  await page.getByLabel("מסך וידאו").check();
  await page.getByLabel("מסך תרחיש").check();
  await page.getByRole("button", { name: "בדיקה" }).click();
  await expect(page.getByText("מצוין.")).toBeVisible();
  await cont(page);

  // 7. True / false
  await expect(title(page)).toHaveText("נכון או לא נכון");
  await page.getByRole("radio", { name: "נכון", exact: true }).check();
  await page.getByRole("button", { name: "בדיקה" }).click();
  await cont(page);

  // 8. Scenario: decision hidden until the pause point, wrong answer → branch
  await expect(title(page)).toHaveText("תרחיש עם בחירת פעולה");
  await expect(page.getByText("צפו בסרטון. השאלה תופיע בהמשך.")).toBeVisible();
  await watchVideo(page, 45); // 4.5s > pauseAt 4s
  await page.getByLabel("סוגרים את הדפדפן").check();
  await page.getByRole("button", { name: "בדיקה" }).click();
  await cont(page);
  await expect(title(page)).toHaveText("הסבר נוסף");
  await cont(page);

  // 9. Hotspots, keyboard accessible buttons
  await expect(title(page)).toHaveText("זיהוי נקודות על תמונה");
  await page.getByRole("button", { name: "דלת עליונה" }).click();
  await expect(page.getByRole("button", { name: "דלת עליונה" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "דלת צדדית" }).focus();
  await page.keyboard.press("Enter");
  await shot("hotspot");
  await page.getByRole("button", { name: "בדיקה" }).click();
  await expect(page.getByText("מצאתם את שתי הדלתות.")).toBeVisible();
  await axe(page);
  await cont(page);

  // 10. Sequence: reorder with buttons into the correct order
  await expect(title(page)).toHaveText("סידור פעולות");
  const correct = ["מרתיחים מים", "שמים שקית תה בכוס", "יוצקים את המים לכוס", "ממתינים כמה דקות"];
  for (let target = 0; target < correct.length; target++) {
    const texts = await page.locator(".mp-seq-text").allTextContents();
    let at = texts.indexOf(correct[target]!);
    while (at > target) {
      await page.getByRole("button", { name: `העברה למעלה: ${correct[target]}` }).click();
      at--;
    }
  }
  await expect(page.locator(".mp-seq-text")).toHaveText(correct);
  await shot("sequence");
  await page.getByRole("button", { name: "בדיקה" }).click();
  await expect(page.getByText("הסדר נכון.")).toBeVisible();
  await cont(page);

  // 11. Summary → finish
  await expect(title(page)).toHaveText("סיכום");
  await expect(page.getByText("ציון: 5 מתוך 5 נקודות")).toBeVisible();
  await page.getByRole("button", { name: "סיום" }).click();
  await expect(page.getByText("עברת את הקורס")).toBeVisible();
  await shot("summary");
  await axe(page);

  // Back still works for review; restart resets.
  await page.getByRole("button", { name: "התחלה מחדש" }).click();
  await expect(page.getByRole("heading", { name: "הדגמת נגן MOZES LIFE" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("learners cannot open the editor preview", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(USERS.learner.email);
  await page.getByLabel("סיסמה").fill(USERS.learner.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.goto("/studio/preview/demo");
  await expect(page.getByRole("heading", { name: "אין לך הרשאה לאזור הזה" })).toBeVisible();
});
