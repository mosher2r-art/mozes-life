CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'captions');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready');--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_kind_idx" ON "asset" USING btree ("kind","status");