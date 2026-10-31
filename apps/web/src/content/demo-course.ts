import type { CourseInput } from "@mozes/content-schema";

/**
 * TECHNICAL DEMO COURSE — exercises every template and interaction of the player.
 * Deliberately NON-MEDICAL. Must never be presented to learners as training content.
 */
export const DEMO_MEDIA: Record<string, { src: string; mime?: string }> = {
  scene: { src: "/demo/scene.jpg", mime: "image/jpeg" },
  poster: { src: "/demo/demo-poster.jpg", mime: "image/jpeg" },
  room: { src: "/demo/room.svg", mime: "image/svg+xml" },
  clip: { src: "/demo/demo-clip.mp4", mime: "video/mp4" },
  "clip-captions": { src: "/demo/demo-clip.he.vtt", mime: "text/vtt" },
};

const p = (text: string) => ({ kind: "paragraph" as const, content: [{ text }] });

export const demoCourse: CourseInput = {
  schema: "mozes-course",
  schemaVersion: 1,
  id: "demo-player",
  title: "הדגמת נגן MOZES LIFE",
  locale: "he",
  settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: 60 } },
  units: [
    {
      id: "u-basics",
      title: "יחידה 1: הכרת הנגן",
      screens: [
        {
          id: "intro",
          title: "פתיחה",
          template: "cinematic_intro",
          slots: {
            background: [{ id: "intro-bg", type: "image", media: { assetId: "scene" }, alt: "", decorative: true }],
            title: [{ id: "intro-h", type: "heading", text: "הדגמת נגן MOZES LIFE", level: 1 }],
            body: [{ id: "intro-p", type: "richText", body: [p("זהו קורס הדגמה טכני שמציג את סוגי המסכים והאינטראקציות. הוא אינו תוכן לימודי.")] }],
          },
        },
        {
          id: "text",
          title: "מסך טקסט והסבר",
          template: "text",
          slots: {
            body: [
              { id: "text-h", type: "heading", text: "כך בנוי קורס", level: 1 },
              {
                id: "text-rt",
                type: "richText",
                body: [
                  { kind: "paragraph", content: [{ text: "כל קורס מחולק ל" }, { text: "יחידות", bold: true }, { text: ", כל יחידה ל" }, { text: "מסכים", bold: true }, { text: ", וכל מסך מורכב מרכיבים." }] },
                  { kind: "list", ordered: false, items: [[{ text: "טקסטים וכותרות" }], [{ text: "תמונות, וידאו ושמע" }], [{ text: "שאלות ומשימות" }]] },
                ],
              },
              { id: "text-callout", type: "callout", tone: "info", body: [p("המעבר למסך הבא נעשה בכפתור \"המשך\" בתחתית המסך.")] },
            ],
          },
        },
        {
          id: "media-text",
          title: "מסך תמונה וטקסט",
          template: "media_text",
          slots: {
            media: [{ id: "mt-img", type: "image", media: { assetId: "scene" }, alt: "תמונת אווירה מופשטת: אורות רכים על רקע כחול כהה", caption: "תמונת הדגמה" }],
            body: [
              { id: "mt-h", type: "heading", text: "מדיה לצד טקסט", level: 2 },
              { id: "mt-rt", type: "richText", body: [p("במחשב התמונה והטקסט מוצגים זה לצד זה. בטלפון הם מוצגים אחד מתחת לשני, בלי עיצוב ידני נפרד.")] },
            ],
          },
        },
        {
          id: "video",
          title: "מסך וידאו",
          template: "video",
          slots: {
            video: [
              {
                id: "vid",
                type: "video",
                media: { assetId: "clip" },
                captions: { assetId: "clip-captions" },
                requiredWatchPercent: 80,
                poster: { assetId: "poster" },
                transcript: "סרטון הדגמה טכני ללא קול: מעברי צבע איטיים בגווני כחול וירוק.",
              },
            ],
            body: [{ id: "vid-rt", type: "richText", body: [p("כדי להמשיך יש לצפות לפחות ב-80% מהסרטון. הכתוביות והתמליל זמינים לכולם.")] }],
          },
        },
      ],
    },
    {
      id: "u-interactions",
      title: "יחידה 2: אינטראקציות",
      screens: [
        {
          id: "q-single",
          title: "שאלת בחירה יחידה",
          template: "question",
          slots: {
            question: [
              {
                id: "q1",
                type: "choiceQuestion",
                prompt: "איזה צבע מופיע בלוגו של MOZES LIFE לצד הכחול?",
                mode: "single",
                maxAttempts: 2,
                points: 1,
                feedback: { correct: "נכון, הירוק הוא צבע המותג.", incorrect: "נסו להיזכר בלוגו." },
                options: [
                  { id: "q1-a", text: "ירוק", correct: true },
                  { id: "q1-b", text: "אדום", correct: false },
                  { id: "q1-c", text: "סגול", correct: false },
                ],
              },
            ],
          },
        },
        {
          id: "q-multi",
          title: "שאלת בחירה מרובה",
          template: "question",
          slots: {
            intro: [{ id: "qm-rt", type: "richText", body: [p("בשאלה זו יש יותר מתשובה נכונה אחת.")] }],
            question: [
              {
                id: "q2",
                type: "choiceQuestion",
                prompt: "אילו מהבאים הם סוגי מסכים בנגן?",
                mode: "multiple",
                maxAttempts: 2,
                points: 1,
                shuffle: true,
                feedback: { correct: "מצוין.", incorrect: "לא כל התשובות שסימנתם נכונות, או שחסרה תשובה." },
                options: [
                  { id: "q2-a", text: "מסך וידאו", correct: true },
                  { id: "q2-b", text: "מסך תרחיש", correct: true },
                  { id: "q2-c", text: "מסך גיליון אלקטרוני", correct: false },
                ],
              },
            ],
          },
        },
        {
          id: "q-tf",
          title: "נכון או לא נכון",
          template: "question",
          slots: {
            question: [
              {
                id: "q3",
                type: "trueFalse",
                prompt: "בנגן ניתן לחזור למסך הקודם.",
                answer: true,
                points: 1,
                feedback: { correct: "נכון. הכפתור \"הקודם\" נמצא בתחתית המסך.", incorrect: "דווקא כן, בכפתור \"הקודם\"." },
              },
            ],
          },
        },
        {
          id: "scenario",
          title: "תרחיש עם בחירת פעולה",
          template: "scenario",
          slots: {
            media: [{ id: "sc-vid", type: "video", media: { assetId: "clip" }, poster: { assetId: "poster" }, captions: { assetId: "clip-captions" }, pauseAtMs: 4000 }],
            intro: [{ id: "sc-rt", type: "richText", body: [p("הסרטון ייעצר אחרי 4 שניות ותוצג שאלה. התשובה קובעת לאן ממשיכים: תשובה שגויה מובילה למסך הסבר.")] }],
            decision: [
              {
                id: "sc-q",
                type: "choiceQuestion",
                prompt: "הסרטון נעצר והופיעה שאלה. מה עושים?",
                mode: "single",
                maxAttempts: 1,
                points: 0,
                showCorrectAfterFinalAttempt: false,
                feedback: { correct: "נכון. ממשיכים למשימה הבאה.", incorrect: "נעבור למסך הסבר קצר." },
                options: [
                  { id: "sc-go", text: "עונים על השאלה שעל המסך", correct: true },
                  { id: "sc-explain", text: "סוגרים את הדפדפן", correct: false },
                ],
              },
            ],
          },
          flow: {
            default: { kind: "next" },
            rules: [{ id: "sc-rule", when: { componentId: "sc-q", outcome: { choice: "sc-explain" } }, then: { kind: "goto", screenId: "branch-explain" } }],
          },
        },
        {
          id: "hotspot",
          title: "זיהוי נקודות על תמונה",
          template: "hotspot",
          slots: {
            task: [
              {
                id: "hs",
                type: "hotspotImage",
                prompt: "סמנו את שתי הדלתות בחדר (מסומנות בירוק).",
                media: { assetId: "room" },
                alt: "תרשים קומה של חדר: שולחן עם ארבעה כיסאות, ארון, ספה ושתי דלתות המסומנות בירוק",
                mode: "all",
                maxAttempts: 2,
                points: 1,
                feedback: { correct: "מצאתם את שתי הדלתות.", incorrect: "חסרה דלת, או שסומן אזור אחר." },
                hotspots: [
                  { id: "door-top", label: "דלת עליונה", correct: true, shape: { kind: "rect", x: 10, y: 5, w: 18, h: 10 } },
                  { id: "door-side", label: "דלת צדדית", correct: true, shape: { kind: "rect", x: 89, y: 58, w: 10, h: 28 } },
                  { id: "table", label: "שולחן", correct: false, shape: { kind: "rect", x: 38, y: 38, w: 24, h: 26 } },
                  { id: "cabinet", label: "ארון", correct: false, shape: { kind: "rect", x: 70, y: 16, w: 19, h: 16 } },
                ],
              },
            ],
          },
        },
        {
          id: "sequence",
          title: "סידור פעולות",
          template: "sequence",
          slots: {
            task: [
              {
                id: "seq",
                type: "sequenceTask",
                prompt: "סדרו את שלבי הכנת כוס תה לפי הסדר הנכון.",
                maxAttempts: 2,
                points: 1,
                feedback: { correct: "הסדר נכון.", incorrect: "הסדר אינו נכון." },
                items: [
                  { id: "s1", text: "מרתיחים מים" },
                  { id: "s2", text: "שמים שקית תה בכוס" },
                  { id: "s3", text: "יוצקים את המים לכוס" },
                  { id: "s4", text: "ממתינים כמה דקות" },
                ],
              },
            ],
          },
        },
        {
          id: "summary",
          title: "סיכום",
          template: "summary",
          slots: {
            body: [
              { id: "sum-h", type: "heading", text: "סיימתם את ההדגמה", level: 1 },
              { id: "sum-rt", type: "richText", body: [p("הציון מחושב לפי השאלות שבמסלול שעברתם. ציון המעבר בקורס ההדגמה הוא 60.")] },
            ],
          },
          flow: { default: { kind: "end" }, rules: [] },
        },
        {
          id: "branch-explain",
          title: "הסבר נוסף",
          template: "text",
          required: false,
          slots: {
            body: [
              { id: "be-h", type: "heading", text: "זהו מסך של הסתעפות", level: 1 },
              { id: "be-rt", type: "richText", body: [p("הגעתם לכאן בעקבות התשובה בתרחיש. כשסרטון נעצר, עונים על השאלה שמופיעה. בסיום המסך חוזרים למסלול הראשי.")] },
            ],
          },
          flow: { default: { kind: "goto", screenId: "hotspot" }, rules: [] },
        },
      ],
    },
  ],
};
