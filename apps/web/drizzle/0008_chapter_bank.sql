CREATE TYPE "public"."chapter_kind" AS ENUM('lesson', 'exam');--> statement-breakpoint
CREATE TABLE "chapter" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" "chapter_kind" DEFAULT 'lesson' NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "chapter_ids" jsonb;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "builder_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "certificate_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "passing_score" integer;--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Courses that existed before this change already issued certificates; keep that behaviour.
UPDATE "course" SET "certificate_enabled" = true WHERE "is_demo" = false;
