-- GENERATED from the Drizzle journal. Fresh database ONLY; never use for an existing installation.
-- Run as the new Supabase project owner. No passwords or application data are included.
BEGIN;
SET LOCAL search_path = public;
DO $$ BEGIN
 IF to_regclass('public.user') IS NOT NULL OR to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
  RAISE EXCEPTION 'Database already initialized. Use reviewed incremental migrations instead.';
 END IF;
END $$;

-- 0000_init
CREATE TYPE "public"."org_role" AS ENUM('org_admin', 'learner');
CREATE TYPE "public"."org_type" AS ENUM('private', 'company', 'institution', 'building');
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'content_admin', 'editor', 'medical_reviewer');
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "membership" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);

CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "org_type" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "user_platform_role" (
	"user_id" text NOT NULL,
	"role" "platform_role" NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_platform_role_user_id_role_pk" PRIMARY KEY("user_id","role")
);

CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_platform_role" ADD CONSTRAINT "user_platform_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_platform_role" ADD CONSTRAINT "user_platform_role_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");

-- 0001_courses_enrollments
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published', 'archived');
CREATE TYPE "public"."enrollment_status" AS ENUM('not_started', 'in_progress', 'completed', 'passed', 'failed');
CREATE TABLE "course" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"estimated_minutes" integer,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"published_version_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_slug_unique" UNIQUE("slug")
);

CREATE TABLE "course_version" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"course_version_id" text,
	"status" "enrollment_status" DEFAULT 'not_started' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"score_percent" integer,
	"state" jsonb,
	"started_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "course" ADD CONSTRAINT "course_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "course_version" ADD CONSTRAINT "course_version_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_version" ADD CONSTRAINT "course_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_course_version_id_course_version_id_fk" FOREIGN KEY ("course_version_id") REFERENCES "public"."course_version"("id") ON DELETE restrict ON UPDATE no action;
CREATE UNIQUE INDEX "course_version_no_idx" ON "course_version" USING btree ("course_id","version_no");
CREATE UNIQUE INDEX "enrollment_user_course_idx" ON "enrollment" USING btree ("user_id","course_id");
CREATE INDEX "enrollment_user_idx" ON "enrollment" USING btree ("user_id");

-- 0002_course_drafts
CREATE TABLE "course_draft" (
	"course_id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "course_draft" ADD CONSTRAINT "course_draft_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_draft" ADD CONSTRAINT "course_draft_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

-- 0003_media_assets
CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'captions');
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready');
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_storage_key_unique" UNIQUE("storage_key")
);

ALTER TABLE "asset" ADD CONSTRAINT "asset_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "asset_kind_idx" ON "asset" USING btree ("kind","status");

-- 0004_import_center
CREATE TYPE "public"."course_kind" AS ENUM('native', 'package');
CREATE TYPE "public"."package_format" AS ENUM('scorm12', 'scorm2004', 'html5');
CREATE TABLE "course_package" (
	"id" text PRIMARY KEY NOT NULL,
	"format" "package_format" NOT NULL,
	"title" text NOT NULL,
	"launch_path" text NOT NULL,
	"file_count" integer NOT NULL,
	"total_bytes" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "import_job" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"report" jsonb,
	"package_id" text,
	"course_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "course" ADD COLUMN "kind" "course_kind" DEFAULT 'native' NOT NULL;
ALTER TABLE "course" ADD COLUMN "package_id" text;
ALTER TABLE "course_package" ADD CONSTRAINT "course_package_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

-- 0005_users_certificates
CREATE TABLE "certificate" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"learner_name" text NOT NULL,
	"course_title" text NOT NULL,
	"score_percent" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_code_unique" UNIQUE("code"),
	CONSTRAINT "certificate_enrollment_id_unique" UNIQUE("enrollment_id")
);

ALTER TABLE "user" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "certificate_user_idx" ON "certificate" USING btree ("user_id");

-- 0006_course_access
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

ALTER TABLE "course_access" ADD CONSTRAINT "course_access_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "course_access_user_idx" ON "course_access" USING btree ("user_id");
CREATE INDEX "course_access_org_idx" ON "course_access" USING btree ("org_id");
CREATE INDEX "course_access_course_idx" ON "course_access" USING btree ("course_id");
-- Keep existing assignments working: every current enrollment becomes an open-ended personal grant.
INSERT INTO "course_access" ("id", "course_id", "user_id", "valid_from", "note")
SELECT gen_random_uuid()::text, e."course_id", e."user_id", (now() AT TIME ZONE 'Asia/Jerusalem')::date, 'הועבר משיוך קודם'
FROM "enrollment" e;


-- 0007_org_seats
ALTER TABLE "organization" ADD COLUMN "seat_limit" integer;

-- 0008_chapter_bank
CREATE TYPE "public"."chapter_kind" AS ENUM('lesson', 'exam');
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

ALTER TABLE "course" ADD COLUMN "chapter_ids" jsonb;
ALTER TABLE "course" ADD COLUMN "builder_revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "course" ADD COLUMN "certificate_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "course" ADD COLUMN "passing_score" integer;
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
-- Courses that existed before this change already issued certificates; keep that behaviour.
UPDATE "course" SET "certificate_enabled" = true WHERE "is_demo" = false;


-- 0009_auth_rate_limit
CREATE TABLE "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL
);


-- 0010_server_permissions
-- Server-only access. Better Auth identities are NOT Supabase Auth identities.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mozes_app') THEN
    CREATE ROLE mozes_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO mozes_app;
ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."account" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."account" TO mozes_app;
CREATE POLICY mozes_server_only ON public."account" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."audit_log" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_log" TO mozes_app;
CREATE POLICY mozes_server_only ON public."audit_log" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."membership" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."membership" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."membership" TO mozes_app;
CREATE POLICY mozes_server_only ON public."membership" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."organization" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."organization" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."organization" TO mozes_app;
CREATE POLICY mozes_server_only ON public."organization" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."session" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."session" TO mozes_app;
CREATE POLICY mozes_server_only ON public."session" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."user" TO mozes_app;
CREATE POLICY mozes_server_only ON public."user" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."user_platform_role" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user_platform_role" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."user_platform_role" TO mozes_app;
CREATE POLICY mozes_server_only ON public."user_platform_role" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."verification" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."verification" TO mozes_app;
CREATE POLICY mozes_server_only ON public."verification" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."course" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."course" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."course" TO mozes_app;
CREATE POLICY mozes_server_only ON public."course" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."course_version" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."course_version" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."course_version" TO mozes_app;
CREATE POLICY mozes_server_only ON public."course_version" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."enrollment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."enrollment" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."enrollment" TO mozes_app;
CREATE POLICY mozes_server_only ON public."enrollment" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."course_draft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."course_draft" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."course_draft" TO mozes_app;
CREATE POLICY mozes_server_only ON public."course_draft" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."asset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."asset" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."asset" TO mozes_app;
CREATE POLICY mozes_server_only ON public."asset" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."import_job" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."import_job" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."import_job" TO mozes_app;
CREATE POLICY mozes_server_only ON public."import_job" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."course_package" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."course_package" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."course_package" TO mozes_app;
CREATE POLICY mozes_server_only ON public."course_package" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."certificate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."certificate" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."certificate" TO mozes_app;
CREATE POLICY mozes_server_only ON public."certificate" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."course_access" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."course_access" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."course_access" TO mozes_app;
CREATE POLICY mozes_server_only ON public."course_access" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."chapter" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."chapter" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."chapter" TO mozes_app;
CREATE POLICY mozes_server_only ON public."chapter" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
ALTER TABLE public."rate_limit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."rate_limit" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."rate_limit" TO mozes_app;
CREATE POLICY mozes_server_only ON public."rate_limit" FOR ALL TO mozes_app USING (true) WITH CHECK (true);
DO $$ DECLARE t text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['account','audit_log','membership','organization','session','user','user_platform_role','verification','course','course_version','enrollment','course_draft','asset','import_job','course_package','certificate','course_access','chapter','rate_limit'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- 0011_schema_v2
-- Additive v2 storage and publication metadata. No existing content JSON is rewritten.
ALTER TYPE public.asset_kind ADD VALUE IF NOT EXISTS 'animation';

ALTER TABLE public.asset ADD COLUMN private_storage boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset ADD COLUMN current_version_id text;
ALTER TABLE public.chapter ADD COLUMN published_version_id text;
ALTER TABLE public.chapter ADD COLUMN draft_asset_pins jsonb;
ALTER TABLE public.course_version ADD COLUMN asset_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.asset_version (
 id text PRIMARY KEY, asset_id text NOT NULL REFERENCES public.asset(id) ON DELETE CASCADE,
 version_no integer NOT NULL CHECK(version_no > 0), content_identity text NOT NULL, filename text NOT NULL, mime text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes >= 0), storage_key text NOT NULL, normalized_key text,
 private_storage boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 metadata jsonb NOT NULL, created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT asset_version_number_idx UNIQUE(asset_id, version_no), CONSTRAINT asset_version_identity_idx UNIQUE(id,asset_id)
);
ALTER TABLE public.asset ADD CONSTRAINT asset_current_version_fk FOREIGN KEY(current_version_id,id) REFERENCES public.asset_version(id,asset_id) DEFERRABLE INITIALLY DEFERRED;

-- Existing assets get immutable metadata records; rights/reviews remain unknown, never fabricated.
INSERT INTO public.asset_version(id,asset_id,version_no,content_identity,filename,mime,size_bytes,storage_key,private_storage,status,metadata,created_by,created_at)
SELECT 'av-legacy-' || id,id,1,'legacy-' || id,filename,mime,size_bytes,storage_key,false,status::text,
 jsonb_build_object('altText',alt_text,'source','','licenseType','unknown','commercialUseAllowed',NULL,'creditRequired',false,'creditText','','editingAllowed',NULL,'medicalStatus','draft'),uploaded_by,created_at
FROM public.asset;
UPDATE public.asset SET current_version_id='av-legacy-' || id;

CREATE TABLE public.chapter_version (
 id text PRIMARY KEY, chapter_id text NOT NULL REFERENCES public.chapter(id) ON DELETE CASCADE,
 version_no integer NOT NULL CHECK(version_no > 0), content jsonb NOT NULL, content_hash text NOT NULL,
 asset_manifest jsonb NOT NULL, published_by text REFERENCES public."user"(id) ON DELETE SET NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT chapter_version_number_idx UNIQUE(chapter_id,version_no), CONSTRAINT chapter_version_identity_idx UNIQUE(id,chapter_id)
);
ALTER TABLE public.chapter ADD CONSTRAINT chapter_published_version_fk FOREIGN KEY(published_version_id,id) REFERENCES public.chapter_version(id,chapter_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.screen_review (
 id text PRIMARY KEY, seq bigserial NOT NULL UNIQUE, chapter_id text NOT NULL REFERENCES public.chapter(id) ON DELETE CASCADE,
 screen_id text NOT NULL, content_hash text NOT NULL, status text NOT NULL CHECK(status IN ('approved','rejected')),
 reviewed_by text NOT NULL REFERENCES public."user"(id), reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(), note text NOT NULL DEFAULT ''
);
CREATE INDEX screen_review_content_idx ON public.screen_review(chapter_id,screen_id,content_hash);

CREATE TABLE public.device_model (
 id text PRIMARY KEY, name text NOT NULL, manufacturer text NOT NULL,
 device_type text NOT NULL CHECK(device_type IN ('semi_automatic','fully_automatic')), manual_url text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified')),
 verified_by text REFERENCES public."user"(id), verified_at timestamptz, evidence jsonb,
 created_by text REFERENCES public."user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT device_model_verified_evidence CHECK(status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND coalesce(evidence->>'guideReviewed'='true',false) AND coalesce(evidence->>'trainerTested'='true',false)))
);

CREATE FUNCTION public.mozes_v2_immutable_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='asset_version' THEN
  IF OLD.status='pending' THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='chapter_version' THEN
  IF NEW.published_by IS NULL AND (to_jsonb(NEW)-'published_by')=(to_jsonb(OLD)-'published_by') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Published or ready versions are immutable; create a new version';
END $$;
REVOKE ALL ON FUNCTION public.mozes_v2_immutable_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mozes_v2_immutable_version() TO mozes_app;
CREATE TRIGGER asset_version_immutable BEFORE UPDATE ON public.asset_version FOR EACH ROW EXECUTE FUNCTION public.mozes_v2_immutable_version();
CREATE TRIGGER chapter_version_immutable BEFORE UPDATE ON public.chapter_version FOR EACH ROW EXECUTE FUNCTION public.mozes_v2_immutable_version();

ALTER TABLE public.asset_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screen_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_model ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_version,public.chapter_version,public.screen_review,public.device_model FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.screen_review_seq_seq FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.asset_version TO mozes_app;
GRANT SELECT,INSERT ON public.chapter_version,public.screen_review TO mozes_app;
GRANT SELECT,INSERT,UPDATE ON public.device_model TO mozes_app;
GRANT USAGE ON SEQUENCE public.screen_review_seq_seq TO mozes_app;
CREATE POLICY mozes_server_only ON public.asset_version FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.chapter_version FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.screen_review FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.device_model FOR ALL TO mozes_app USING(true) WITH CHECK(true);
DO $$ DECLARE r text; t text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   FOREACH t IN ARRAY ARRAY['asset_version','chapter_version','screen_review','device_model'] LOOP EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r); END LOOP;
   EXECUTE format('REVOKE ALL ON SEQUENCE public.screen_review_seq_seq FROM %I',r);
  END IF;
 END LOOP;
END $$;


CREATE SCHEMA IF NOT EXISTS drizzle;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;
CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('616e333cd0ee22cb61f5e78244ceee39ca6ff374b9379cbba26f54c832cfe316', 1793478747156);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('4acb3b56e0d6cd8181410f0eca0187a4874cf1eaed609ca1721cd429304d752f', 1793536782463);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('4d60bdbc3a2cb64f202132b685862f74b966955eca83447d4c357d1c4c20df3d', 1793553591305);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('0edf1e543c578bf197742ee074ea2d284fb534fafb68cb85bf1ed7f664496b6d', 1793555514209);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('843c5287907c82d2a2b6f27c9a156535b11da8d0f62194395ba4b88b491a8fe7', 1793556990856);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('421fb1e395f72dfc2717081e223ba975f2b0d33c4afb19831b312807443684ad', 1793558992597);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c624075684a5d5b211b23bff460e032ec9584929cd64aba155ada3e3fdb53aea', 1793560930859);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('a14ecdc31f5c757c5a053467b1db0ce6d64dce674aad5ba2da77e9589d734d8a', 1793562074373);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('f9b20099b2ddabd016d82d37c45347920d068d6b5450ba770782d66661cc4ff5', 1793563429311);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c0252f6bf561946da1bdfd1be16fb1e4e9c07cfbc3d3969d3a0e8ce7fa71ffda', 1793613600000);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('9fbd0cc7eccd152288dbae10aeb9af6de397e8924d999fbaf3db24983d2ce99c', 1793613600001);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('1998cceecece7c6deac6b7a529296dfda961838a4e8c0e89e585576a857c2465', 1793613600002);
COMMIT;
