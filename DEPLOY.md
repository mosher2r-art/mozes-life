# העלאת MOZES LIFE לאוויר — חינם (לתצוגה ובדיקות)

האתר רץ ב-**Render** (שרת), ובסיס הנתונים ב-**Neon**. שניהם בתוכנית חינמית, בלי כרטיס אשראי.

> מתאים לתצוגה ולבדיקות, לא ללקוחות משלמים: האתר "נרדם" אחרי 15 דקות בלי כניסות, והכניסה הבאה לוקחת בערך דקה.

## שלב 1 — בסיס נתונים ב-Neon (כ-5 דקות)
1. נכנסים ל-https://neon.tech ולוחצים **Sign up**. נרשמים עם GitHub.
2. יוצרים פרויקט חדש:
   - **Project name:** `mozes-life`
   - **Region:** `AWS US East 2 (Ohio)` (אותו אזור שבו רץ האתר ב-Render)
   - **Postgres version:** 16 או חדש יותר
3. במסך הפרויקט לוחצים **Connect**. מעתיקים את **Connection string**. היא מתחילה ב-`postgresql://` ומסתיימת ב-`sslmode=require`.
   שומרים אותה בצד. **זו סיסמה, לא משתפים אותה.**

## שלב 2 — האתר ב-Render (כ-10 דקות)
1. נכנסים ל-https://render.com ונרשמים עם GitHub.
2. מאשרים ל-Render גישה למאגר `mozes-life`.
3. לוחצים **New +** ← **Blueprint** ובוחרים את המאגר `mosher2r-art/mozes-life`.
4. Render קורא את הקובץ `render.yaml` ומבקש למלא כמה ערכים:

| שדה | מה כותבים |
|---|---|
| `DATABASE_URL` | ה-Connection string מ-Neon |
| `BOOTSTRAP_ADMIN_EMAIL` | האימייל שלך (המשתמש המנהל הראשון) |
| `BOOTSTRAP_ADMIN_PASSWORD` | סיסמה חדשה, לפחות 10 תווים |
| `BOOTSTRAP_ADMIN_NAME` | השם שיוצג במערכת |

5. לוחצים **Apply**. הבנייה הראשונה לוקחת בערך 5–8 דקות.
6. בסיום מופיעה כתובת בסגנון `https://mozes-life-xxxx.onrender.com`. זה האתר.

## שלב 3 — כניסה ראשונה
- נכנסים לכתובת ומתחברים עם האימייל והסיסמה מהשלב הקודם.
- בכניסה הראשונה המערכת יוצרת אוטומטית את המשתמש המנהל ואת קורס ההדגמה.
- מומלץ למחוק אחר כך מ-Render את `BOOTSTRAP_ADMIN_PASSWORD` (Environment ← מחיקה). המשתמש כבר קיים, והמשתנה לא נדרש יותר.

## אחסון קבצים (סרטונים ותמונות) — Cloudflare R2

בלי השלב הזה ספריית המדיה מציגה "אחסון הקבצים עדיין לא הוגדר". Render מוחק קבצים בכל הפעלה, ולכן הקבצים נשמרים ב-R2.
חינם עד 10GB, ובלי תשלום על צפייה. **ייתכן ש-Cloudflare יבקש להוסיף אמצעי תשלום כדי להפעיל את R2, גם בשימוש בחינם.**

1. ב-https://dash.cloudflare.com פותחים **R2 Object Storage**, ואם צריך לוחצים **Enable** / **Purchase R2** (התוכנית החינמית).
2. **Create bucket** ← שם: `mozes-life-media` ← **Create**.
3. בתוך ה-bucket: **Settings** ← **Public Development URL** (או r2.dev subdomain) ← **Enable**. מעתיקים את הכתובת שמתחילה ב-`https://pub-`.
4. באותו מסך: **CORS policy** ← **Add CORS policy** ← מדביקים (עם הכתובת של האתר שלך ב-Render):
   ```json
   [{"AllowedOrigins":["https://mozes-life-xxxx.onrender.com"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
   ```
5. חוזרים למסך הראשי של R2 ← **Manage API tokens** ← **Create API token**:
   - **Permissions:** Object Read & Write
   - **Specify bucket:** `mozes-life-media`
   - **Create** ← מעתיקים את **Access Key ID** ואת **Secret Access Key** (מוצג פעם אחת בלבד).
   - במסך הראשי של R2 מופיע גם **Account ID** — מעתיקים.
6. ב-Render ← השירות ← **Environment** ← **Edit** ← מוסיפים:

| KEY | VALUE |
|---|---|
| `R2_ACCOUNT_ID` | ה-Account ID |
| `R2_ACCESS_KEY_ID` | ה-Access Key ID |
| `R2_SECRET_ACCESS_KEY` | ה-Secret Access Key |
| `R2_BUCKET` | `mozes-life-media` |
| `R2_PUBLIC_BASE_URL` | הכתובת `https://pub-...r2.dev` |

7. **Save, rebuild, and deploy** (חשוב לבחור rebuild — הגדרות האבטחה של האתר נבנות לפי הכתובות האלה).

> כתובת `r2.dev` מתאימה לבדיקות. לפני השקה מחברים ל-bucket דומיין משלכם (Custom Domain) ומעדכנים את `R2_PUBLIC_BASE_URL`.

## עדכונים
כל שינוי שנכנס לגרסה הראשית ב-GitHub מתעדכן באתר אוטומטית.

## אם משהו לא עובד
ב-Render פותחים את השירות ← **Logs**, ושולחים צילום מסך של השורות האחרונות.
