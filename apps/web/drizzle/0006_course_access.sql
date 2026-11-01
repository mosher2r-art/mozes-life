CREATE TABLE "course_access" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"user_id" text,
	"org_id" text,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"revoked_at" timestamp with time zone,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_access_one_subject" CHECK (("course_access"."user_id" is null) <> ("course_access"."org_id" is null)),
	CONSTRAINT "course_access_dates" CHECK ("course_access"."valid_until" is null or "course_access"."valid_until" >= "course_access"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_access_user_idx" ON "course_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "course_access_org_idx" ON "course_access" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "course_access_course_idx" ON "course_access" USING btree ("course_id");--> statement-breakpoint
-- Keep existing assignments working: every current enrollment becomes an open-ended personal grant.
INSERT INTO "course_access" ("id", "course_id", "user_id", "valid_from", "note")
SELECT gen_random_uuid()::text, e."course_id", e."user_id", (now() AT TIME ZONE 'Asia/Jerusalem')::date, 'הועבר משיוך קודם'
FROM "enrollment" e;
