import { z } from "zod";
import * as V1 from "./schema-v1";
import { ScenePage } from "./interactive";

export const LATEST_SCHEMA_VERSION = 2 as const;
export const Placeholder = z.object({ requestId: V1.Id, description: z.string().trim().min(1).max(2000) }).strict();
export const MediaRefV2 = z.union([
  z.object({ assetId: V1.Id }).strict(),
  z.object({ placeholder: Placeholder, assetId: z.never().optional() }).strict(),
]);
export type MediaRefV2 = z.infer<typeof MediaRefV2>;
export function mediaId(ref: MediaRefV2 | undefined): string | undefined { return ref?.assetId; }
export function isPlaceholder(ref: MediaRefV2): ref is Extract<MediaRefV2, { placeholder: unknown }> { return "placeholder" in ref; }
export const CaptionTrack = z.object({ media: MediaRefV2, language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).default("he"), label: z.string().trim().min(1).max(100), default: z.boolean().default(false) }).strict();
export const CaptionsV2 = z.union([MediaRefV2, z.array(CaptionTrack).min(1).max(10)]);
export type CaptionsV2 = z.infer<typeof CaptionsV2>;
export function captionRefs(captions?: CaptionsV2): MediaRefV2[] { return !captions ? [] : Array.isArray(captions) ? captions.map(t => t.media) : [captions]; }
const credit = z.string().trim().max(1000).optional();
const aspectRatio = z.enum(["auto", "16:9", "4:3", "1:1", "9:16"]).default("auto");
export const ImageV2 = V1.Image.extend({ media: MediaRefV2, credit, aspectRatio });
export const VideoV2 = V1.Video.extend({ media: MediaRefV2, poster: MediaRefV2.optional(), captions: CaptionsV2.optional() });
export const AudioV2 = V1.Audio.extend({ media: MediaRefV2, autoplay: z.boolean().default(false) });
export const Animation = z.object({ id: V1.Id, type: z.literal("animation"), media: MediaRefV2, alt: z.string().trim().min(1).max(500), loop: z.boolean().default(false), playOn: z.enum(["enter", "click"]).default("click") }).strict();
export const RevealContent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), body: V1.RichTextBody }).strict(),
  z.object({ kind: z.literal("image"), media: MediaRefV2, alt: z.string().trim().min(1).max(300), caption: z.string().max(300).optional(), credit }).strict(),
]);
export const Reveal = z.object({ id: V1.Id, type: z.literal("reveal"), items: z.array(z.object({ id: V1.Id, title: z.string().trim().min(1).max(200), content: RevealContent }).strict()).min(1).max(30), mode: z.enum(["sequential", "any"]).default("any"), requireAll: z.boolean().default(true) }).strict();
export const HotspotExplore = z.object({ id: V1.Id, type: z.literal("hotspotExplore"), media: MediaRefV2, alt: z.string().trim().min(1).max(300), hotspots: z.array(z.object({ id: V1.Id, label: z.string().trim().min(1).max(120), shape: V1.HotspotShape, title: z.string().trim().min(1).max(200), body: V1.RichTextBody }).strict()).min(1).max(20), requireAll: z.boolean().default(true) }).strict();
export const ScenarioValue = z.union([z.boolean(), z.number().finite(), z.string().max(300)]);
export const ScenarioVariables = z.record(V1.Id, ScenarioValue).refine(v => Object.keys(v).length <= 30, "אפשר להגדיר עד 30 משתני תרחיש");
export const ChoiceQuestionV2 = V1.ChoiceQuestion.extend({ options: z.array(V1.ChoiceOption.extend({ image: MediaRefV2.optional(), imageAlt: z.string().max(300).optional(), setVariables: ScenarioVariables.optional() })).min(2).max(8) });
export const HotspotImageV2 = V1.HotspotImage.extend({ media: MediaRefV2 });
export const SIMULATION_MODULES = {
  "software-sequence": { version: 1, publishable: false, label: "בדיקת תוכנה בלבד — שלושה כפתורים", requiresDevice: false },
} as const;
export const SimulationConfig = z.object({ steps: z.tuple([z.string().trim().min(1).max(120), z.string().trim().min(1).max(120), z.string().trim().min(1).max(120)]), deviceModelId: V1.Id.optional() }).strict();
export const Simulation = z.object({ id: V1.Id, type: z.literal("simulation"), module: z.literal("software-sequence", { error: "מודול הסימולציה אינו רשום; אין כרגע סימולטור AED רפואי זמין" }), moduleVersion: z.literal(1), config: SimulationConfig, completion: z.object({ required: z.boolean().default(true) }).strict().default({ required: true }) }).strict();
export const ComponentV2 = z.discriminatedUnion("type", [
  V1.Heading, V1.RichText, V1.Callout, ImageV2, VideoV2, AudioV2, V1.Button,
  ChoiceQuestionV2, V1.TrueFalse, HotspotImageV2, V1.SequenceTask,
  Animation, Reveal, HotspotExplore, Simulation,
  // Existing interactive scenes remain lossless and supported.
  z.object({ id: V1.Id, type: z.literal("interactiveScene"), scene: ScenePage }).strict(),
]);
export type ComponentV2 = z.infer<typeof ComponentV2>;
export const FlowRuleV2 = z.object({ id: V1.Id, when: z.union([
  z.object({ componentId: V1.Id, outcome: V1.RuleOutcome }).strict(),
  z.object({ variable: V1.Id, equals: ScenarioValue }).strict(),
]), then: V1.FlowTarget }).strict();
export const MedicalV2 = z.object({ relevant: z.boolean(), sources: z.array(z.object({ title: z.string().trim().min(1).max(500), url: z.string().url().refine(v => new URL(v).protocol === "https:", "נדרש קישור HTTPS"), date: z.iso.date() }).strict()).max(30).optional(), reviewedBy: z.string().trim().min(1).max(200).optional(), reviewedAt: z.iso.datetime({ offset: true }).optional() }).strict();
export const Narration = z.object({ media: MediaRefV2, captions: MediaRefV2.optional(), cues: z.array(z.object({ atMs: z.number().int().min(0).max(86_400_000), componentId: V1.Id }).strict()).max(100), autoplay: z.boolean().default(true) }).strict();
export const TEMPLATE_IDS_V2 = [...V1.TEMPLATE_IDS, "decision"] as const;
export const ScreenV2 = V1.Screen.extend({ template: z.enum(TEMPLATE_IDS_V2), slots: z.record(z.string().max(32), z.array(ComponentV2).max(30)), flow: z.object({ default: V1.FlowTarget.default({ kind: "next" }), rules: z.array(FlowRuleV2).max(20).default([]) }).strict().default({ default: { kind: "next" }, rules: [] }), medical: MedicalV2.default({ relevant: false }), narration: Narration.optional() });
export const UnitV2 = V1.Unit.extend({ screens: z.array(ScreenV2).max(200) });
export const CourseV2 = V1.Course.extend({ schemaVersion: z.literal(2), units: z.array(UnitV2).max(50), settings: V1.CourseSettings.extend({ variables: z.record(V1.Id, ScenarioValue).refine(v => Object.keys(v).length <= 1500,"בקורס ניתן לשלב עד 1500 משתנים מפרקים שונים").optional() }).default({ navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: null } }) });
export type CourseV2 = z.infer<typeof CourseV2>;
export const ChapterFileV2 = z.object({ schema: z.literal("mozes-chapter"), schemaVersion: z.literal(2), title: z.string().trim().min(1).max(120), kind: V1.UnitKind.default("lesson"), description: z.string().trim().max(2000).optional(), screens: z.array(ScreenV2).min(1).max(200), variables: ScenarioVariables.optional() }).strict();
export type ChapterFileV2 = z.infer<typeof ChapterFileV2>;

export type ScreenV2 = z.infer<typeof ScreenV2>;
export type UnitV2 = z.infer<typeof UnitV2>;

export type CaptionTrack = z.infer<typeof CaptionTrack>;

export type ChoiceOptionV2 = z.infer<typeof ChoiceQuestionV2>["options"][number];
