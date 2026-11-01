import { z } from "zod";
import type { PlayerEvent } from "./engine";

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** Wire format for learner events (validated before replaying on the server). */
export const ResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choiceQuestion"), optionIds: z.array(Id).min(1).max(8) }).strict(),
  z.object({ type: z.literal("trueFalse"), value: z.boolean() }).strict(),
  z.object({ type: z.literal("hotspotImage"), hotspotIds: z.array(Id).min(1).max(20) }).strict(),
  z.object({ type: z.literal("sequenceTask"), order: z.array(Id).min(2).max(10) }).strict(),
]);

export const PlayerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), componentId: Id, response: ResponseSchema }).strict(),
  z.object({ type: z.literal("media_progress"), componentId: Id, percent: z.number().min(0).max(100) }).strict(),
  z.object({ type: z.literal("continue") }).strict(),
  z.object({ type: z.literal("button"), componentId: Id }).strict(),
  z.object({ type: z.literal("back") }).strict(),
  z.object({ type: z.literal("goto"), screenId: Id }).strict(),
]);

export const EventBatchSchema = z.object({ events: z.array(PlayerEventSchema).min(1).max(50) }).strict();

// Compile-time guarantee that the schema matches the engine's event type.
type _Check = z.infer<typeof PlayerEventSchema> extends PlayerEvent ? true : never;
export const _eventSchemaMatches: _Check = true;
