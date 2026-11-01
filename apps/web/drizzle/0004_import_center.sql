CREATE TYPE "public"."course_kind" AS ENUM('native', 'package');--> statement-breakpoint
CREATE TYPE "public"."package_format" AS ENUM('scorm12', 'scorm2004', 'html5');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "kind" "course_kind" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "package_id" text;--> statement-breakpoint
ALTER TABLE "course_package" ADD CONSTRAINT "course_package_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;