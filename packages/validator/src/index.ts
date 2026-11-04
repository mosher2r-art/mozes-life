import type { Issue } from "./v1";
import type { Course } from "@mozes/content-schema";
import { validateCourse as validateV1 } from "./v1";
import { validateV2, type ValidationContext } from "./v2";
export { TECHNICAL_ONLY_NOTICE } from "./v1";
export type { Issue, Severity } from "./v1";
export type { ValidationContext } from "./v2";
export interface ValidationResult { ok: boolean; issues: Issue[]; course?: Course }
/** Version 1 always follows its frozen parser and semantic checks. */
export function validateCourse(input: unknown, context?: ValidationContext): ValidationResult {
  const version = input && typeof input === "object" ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === 2) return validateV2(input, context);
  return validateV1(input);
}
