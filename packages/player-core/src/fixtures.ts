import { Course, type CourseInput } from "@mozes/content-schema";

/** A small, NON-MEDICAL fixture exercising every engine feature. */
export const fixtureInput: CourseInput = {
  schema: "mozes-course",
  schemaVersion: 1,
  id: "fixture",
  title: "קורס בדיקה",
  locale: "he",
  settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: 50 } },
  units: [
    {
      id: "u1",
      title: "יחידה 1",
      screens: [
        {
          id: "s-intro",
          title: "פתיחה",
          template: "text",
          slots: { body: [{ id: "h1", type: "heading", text: "שלום", level: 1 }] },
        },
        {
          id: "s-q",
          title: "שאלה",
          template: "question",
          slots: {
            question: [
              {
                id: "q1",
                type: "choiceQuestion",
                prompt: "בחרו את הצבע הירוק",
                mode: "single",
                maxAttempts: 2,
                points: 2,
                options: [
                  { id: "o-green", text: "ירוק", correct: true },
                  { id: "o-red", text: "אדום", correct: false },
                ],
              },
            ],
          },
        },
        {
          id: "s-scenario",
          title: "תרחיש",
          template: "scenario",
          slots: {
            media: [{ id: "img1", type: "image", media: { assetId: "a1" }, alt: "תמונה" }],
            decision: [
              {
                id: "d1",
                type: "choiceQuestion",
                prompt: "מה עושים?",
                mode: "single",
                maxAttempts: 1,
                points: 0,
                options: [
                  { id: "o-a", text: "דרך א", correct: true },
                  { id: "o-b", text: "דרך ב", correct: false },
                ],
              },
            ],
          },
          flow: {
            default: { kind: "next" },
            rules: [{ id: "r1", when: { componentId: "d1", outcome: { choice: "o-b" } }, then: { kind: "goto", screenId: "s-explain" } }],
          },
        },
      ],
    },
    {
      id: "u2",
      title: "יחידה 2",
      screens: [
        {
          id: "s-video",
          title: "וידאו",
          template: "video",
          slots: { video: [{ id: "v1", type: "video", media: { assetId: "a2" }, requiredWatchPercent: 90 }] },
        },
        {
          id: "s-summary",
          title: "סיכום",
          template: "summary",
          slots: { body: [] },
          flow: { default: { kind: "end" }, rules: [] },
        },
        {
          id: "s-explain",
          title: "הסבר",
          template: "text",
          required: false,
          slots: { body: [{ id: "rt", type: "richText", body: [{ kind: "paragraph", content: [{ text: "הסבר" }] }] }] },
          flow: { default: { kind: "goto", screenId: "s-video" }, rules: [] },
        },
      ],
    },
  ],
};

export const fixture = Course.parse(fixtureInput);
