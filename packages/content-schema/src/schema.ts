/**
 * mozes-course v1 — the internal content format of MOZES LIFE.
 *
 * Hierarchy: Course → Unit → Screen → Component.
 * Layout is never free-form: each Screen uses a Template whose named slots decide
 * where components go (see templates.ts). The only positional data are hotspot
 * shapes, expressed in percentages of the image so they scale on every device.
 *
 * Rich text is stored as structured blocks (not HTML) so content can never carry
 * markup or script.
 */
import { z } from "zod";

export const SCHEMA_ID = "mozes-course";
export const SCHEMA_VERSION = 1;

/* ───────────── Primitives ───────────── */

export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "מזהה יכול להכיל רק אותיות לטיניות, ספרות, _ ו-");
export type Id = z.infer<typeof Id>;

const Text = (max: number) => z.string().trim().max(max);
const RequiredText = (max: number) => z.string().trim().min(1, "שדה חובה").max(max);

/** Reference to an asset in the media library (resolved by the host app). */
export const MediaRef = z.object({ assetId: Id }).strict();
export type MediaRef = z.infer<typeof MediaRef>;

/** Only http(s) and mailto links; never javascript:, data: etc. */
export const SafeUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === "https:" || p === "http:" || p === "mailto:";
    } catch {
      return false;
    }
  }, "קישור לא חוקי");

/* ───────────── Rich text ───────────── */

export const Inline = z
  .object({
    text: z.string().max(5000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: SafeUrl.optional(),
  })
  .strict();
export type Inline = z.infer<typeof Inline>;

export const Block = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paragraph"), content: z.array(Inline).max(200) }).strict(),
  z
    .object({
      kind: z.literal("list"),
      ordered: z.boolean(),
      items: z.array(z.array(Inline).max(200)).min(1).max(50),
    })
    .strict(),
]);
export type Block = z.infer<typeof Block>;

export const RichTextBody = z.array(Block).max(100);

/* ───────────── Components ───────────── */

const base = { id: Id };

/** Attempts: 1–10. Unlimited attempts are deliberately not allowed (guarantees progress). */
const Attempts = z.number().int().min(1).max(10);
const Points = z.number().int().min(0).max(100);

const QuestionFeedback = z
  .object({ correct: Text(1000).default(""), incorrect: Text(1000).default("") })
  .strict();

export const Heading = z
  .object({ ...base, type: z.literal("heading"), text: RequiredText(200), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
  .strict();

export const RichText = z.object({ ...base, type: z.literal("richText"), body: RichTextBody }).strict();

export const Callout = z
  .object({ ...base, type: z.literal("callout"), tone: z.enum(["info", "warning", "success"]), body: RichTextBody })
  .strict();

export const Image = z
  .object({
    ...base,
    type: z.literal("image"),
    media: MediaRef,
    alt: Text(300),
    decorative: z.boolean().default(false),
    caption: Text(300).optional(),
  })
  .strict();

export const Video = z
  .object({
    ...base,
    type: z.literal("video"),
    media: MediaRef,
    poster: MediaRef.optional(),
    captions: MediaRef.optional(), // WebVTT
    transcript: Text(20000).optional(),
    /** Percentage of the video that must be watched to complete the screen (0 = none). */
    requiredWatchPercent: z.number().int().min(0).max(100).default(0),
    /** Scenario screens: pause here and reveal the interaction. Omit = reveal at end. */
    pauseAtMs: z.number().int().min(0).optional(),
  })
  .strict();

export const Audio = z
  .object({
    ...base,
    type: z.literal("audio"),
    media: MediaRef,
    /** Required for accessibility (deaf / hard-of-hearing learners). */
    transcript: RequiredText(20000),
  })
  .strict();

export const FlowTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("next") }).strict(),
  z.object({ kind: z.literal("goto"), screenId: Id }).strict(),
  z.object({ kind: z.literal("end") }).strict(),
]);
export type FlowTarget = z.infer<typeof FlowTarget>;

export const Button = z
  .object({ ...base, type: z.literal("button"), label: RequiredText(60), target: FlowTarget })
  .strict();

export const ChoiceOption = z
  .object({ id: Id, text: RequiredText(500), correct: z.boolean(), feedback: Text(1000).optional() })
  .strict();

export const ChoiceQuestion = z
  .object({
    ...base,
    type: z.literal("choiceQuestion"),
    prompt: RequiredText(1000),
    mode: z.enum(["single", "multiple"]),
    options: z.array(ChoiceOption).min(2).max(8),
    shuffle: z.boolean().default(false),
    points: Points.default(1),
    maxAttempts: Attempts.default(2),
    showCorrectAfterFinalAttempt: z.boolean().default(true),
    feedback: QuestionFeedback.default({ correct: "", incorrect: "" }),
  })
  .strict();

export const TrueFalse = z
  .object({
    ...base,
    type: z.literal("trueFalse"),
    prompt: RequiredText(1000),
    answer: z.boolean(),
    points: Points.default(1),
    maxAttempts: Attempts.default(1),
    showCorrectAfterFinalAttempt: z.boolean().default(true),
    feedback: QuestionFeedback.default({ correct: "", incorrect: "" }),
  })
  .strict();

const Percent = z.number().min(0).max(100);

export const HotspotShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), cx: Percent, cy: Percent, r: z.number().min(1).max(50) }).strict(),
  z.object({ kind: z.literal("rect"), x: Percent, y: Percent, w: z.number().min(1).max(100), h: z.number().min(1).max(100) }).strict(),
]);

export const Hotspot = z
  .object({
    id: Id,
    /** Accessible name; also used for the keyboard/list alternative. */
    label: RequiredText(120),
    shape: HotspotShape,
    correct: z.boolean(),
    feedback: Text(1000).optional(),
  })
  .strict();

export const HotspotImage = z
  .object({
    ...base,
    type: z.literal("hotspotImage"),
    prompt: RequiredText(1000),
    media: MediaRef,
    alt: RequiredText(300),
    /** single: pick one area. all: select every correct area. */
    mode: z.enum(["single", "all"]),
    hotspots: z.array(Hotspot).min(1).max(20),
    points: Points.default(1),
    maxAttempts: Attempts.default(2),
    showCorrectAfterFinalAttempt: z.boolean().default(true),
    feedback: QuestionFeedback.default({ correct: "", incorrect: "" }),
  })
  .strict();

export const SequenceTask = z
  .object({
    ...base,
    type: z.literal("sequenceTask"),
    prompt: RequiredText(1000),
    /** Stored in the CORRECT order. The player shuffles for display. */
    items: z.array(z.object({ id: Id, text: RequiredText(300) }).strict()).min(2).max(10),
    points: Points.default(1),
    maxAttempts: Attempts.default(2),
    showCorrectAfterFinalAttempt: z.boolean().default(true),
    feedback: QuestionFeedback.default({ correct: "", incorrect: "" }),
  })
  .strict();

export const Component = z.discriminatedUnion("type", [
  Heading,
  RichText,
  Callout,
  Image,
  Video,
  Audio,
  Button,
  ChoiceQuestion,
  TrueFalse,
  HotspotImage,
  SequenceTask,
]);
export type Component = z.infer<typeof Component>;
export type ComponentType = Component["type"];
export type ComponentOf<T extends ComponentType> = Extract<Component, { type: T }>;

export const QUESTION_TYPES = ["choiceQuestion", "trueFalse", "hotspotImage", "sequenceTask"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type QuestionComponent = ComponentOf<QuestionType>;
export function isQuestion(c: Component): c is QuestionComponent {
  return (QUESTION_TYPES as readonly string[]).includes(c.type);
}

/* ───────────── Flow ───────────── */

export const RuleOutcome = z.union([
  z.enum(["correct", "incorrect", "attempts_exhausted"]),
  z.object({ choice: Id }).strict(),
]);
export type RuleOutcome = z.infer<typeof RuleOutcome>;

export const FlowRule = z
  .object({ id: Id, when: z.object({ componentId: Id, outcome: RuleOutcome }).strict(), then: FlowTarget })
  .strict();
export type FlowRule = z.infer<typeof FlowRule>;

/* ───────────── Screen / Unit / Course ───────────── */

export const TEMPLATE_IDS = [
  "cinematic_intro",
  "text",
  "media_text",
  "video",
  "question",
  "scenario",
  "hotspot",
  "sequence",
  "summary",
] as const;
export const TemplateId = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateId>;

export const Screen = z
  .object({
    id: Id,
    title: RequiredText(120),
    template: TemplateId,
    slots: z.record(z.string().max(32), z.array(Component).max(30)),
    required: z.boolean().default(true),
    flow: z
      .object({ default: FlowTarget.default({ kind: "next" }), rules: z.array(FlowRule).max(20).default([]) })
      .strict()
      .default({ default: { kind: "next" }, rules: [] }),
    /** Marks medically relevant content. The approval status itself lives outside the content. */
    medical: z.object({ relevant: z.boolean() }).strict().default({ relevant: false }),
    /** Internal editor notes; never shown to learners. */
    notes: Text(2000).optional(),
  })
  .strict();
export type Screen = z.infer<typeof Screen>;

export const Unit = z
  .object({ id: Id, title: RequiredText(120), screens: z.array(Screen).max(200) })
  .strict();
export type Unit = z.infer<typeof Unit>;

export const CourseSettings = z
  .object({
    navigation: z.enum(["linear", "free_after_visit"]).default("linear"),
    completion: z
      .object({
        requireAllRequiredScreens: z.boolean().default(true),
        /** 0–100; null = no score requirement. */
        passingScore: z.number().int().min(0).max(100).nullable().default(null),
      })
      .strict()
      .default({ requireAllRequiredScreens: true, passingScore: null }),
  })
  .strict();

export const Course = z
  .object({
    schema: z.literal(SCHEMA_ID),
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: Id,
    title: RequiredText(160),
    locale: z.literal("he"),
    settings: CourseSettings.default({
      navigation: "linear",
      completion: { requireAllRequiredScreens: true, passingScore: null },
    }),
    units: z.array(Unit).max(50),
  })
  .strict();
export type Course = z.infer<typeof Course>;
export type CourseInput = z.input<typeof Course>;
