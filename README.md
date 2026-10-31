# MOZES LIFE

פלטפורמת למידה רפואית דיגיטלית — **לומדים להציל חיים**.

| אזור | נתיב | למי |
|---|---|---|
| MOZES LIFE Studio | `/studio` | צוות תוכן ומנהלים |
| MOZES LIFE Academy | `/learn` | לומדים |

## מצב נוכחי — שלב 0 (תשתית)
התחברות (אימייל וסיסמה, ללא הרשמה עצמית), תפקידים והרשאות שנאכפים בשרת, בסיס נתונים ומיגרציות,
מעטפות Studio ו-Academy בעברית RTL, טוקני עיצוב, בדיקות יחידה ובדיקות E2E (מחשב + נייד + נגישות axe).

## מבנה
```
apps/web          Next.js — Studio, Academy, API
packages/authz    מדיניות הרשאות טהורה + בדיקות
```

## הרצה מקומית
דרישות: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # ולמלא ערכים
pnpm --filter @mozes/web db:migrate
pnpm --filter @mozes/web user:create --email you@example.com --name "שם" --role super_admin
pnpm dev
```

## בדיקות
```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @mozes/web build && pnpm e2e   # דורש מסד בדיקות mozes_life_test
```

## תפקידים
`super_admin`, `content_admin`, `editor`, `medical_reviewer` (צוות) · `org_admin`, `learner` (בארגון).
המדיניות המלאה: `packages/authz/src/index.ts`.

## מיתוג
קובץ הלוגו ב-`apps/web/public/brand/` משמש כפי שסופק, ללא שינוי. נדרש קובץ מקור וקטורי/שקוף מבעל המותג.
