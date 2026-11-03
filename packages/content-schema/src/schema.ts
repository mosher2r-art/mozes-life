/** Versioned facade. The frozen v1 parser remains unchanged. */
import { z } from "zod";
import * as V1 from "./schema-v1";
import * as V2 from "./schema-v2";
export * from "./schema-v1";
export * from "./schema-v2";
export const CourseV1 = V1.Course;
export type CourseV1 = V1.Course;
export const Course = z.discriminatedUnion("schemaVersion", [V1.Course, V2.CourseV2]);
export type Course = z.infer<typeof Course>;
export type CourseInput = z.input<typeof Course>;
export const Component = z.union([V1.Component, V2.ComponentV2]);
export type Component = z.infer<typeof Component>;
export type ComponentOf<T extends Component["type"]> = Extract<Component, { type: T }>;
export type ComponentType = Component["type"];
export const Screen = z.union([V1.Screen, V2.ScreenV2]);
export type Screen = z.infer<typeof Screen>;
export const Unit = z.union([V1.Unit, V2.UnitV2]);
export type Unit = z.infer<typeof Unit>;
export type TemplateId = Screen["template"];
export const TemplateId = z.enum(V2.TEMPLATE_IDS_V2);
export const TEMPLATE_IDS = V2.TEMPLATE_IDS_V2;
export const MediaRef = V2.MediaRefV2;
export type MediaRef = V2.MediaRefV2;
export const FlowRule = V2.FlowRuleV2;
export type FlowRule = z.infer<typeof FlowRule>;
export type HotspotShape = z.infer<typeof V1.HotspotShape>;
export type QuestionComponent = Extract<Component, { type: V1.QuestionType }>;
export function isQuestion(c: Component): c is QuestionComponent { return (V1.QUESTION_TYPES as readonly string[]).includes(c.type); }
/** Explicit in-memory upgrade. Call only when saving/exporting an edited draft. */
export function upgradeDraftToV2(input: Course): V2.CourseV2 {
  return V2.CourseV2.parse({ ...input, schemaVersion: 2 });
}
