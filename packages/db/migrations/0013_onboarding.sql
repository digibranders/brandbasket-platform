CREATE TYPE "public"."media_asset_purpose" AS ENUM('logo', 'photo');--> statement-breakpoint
CREATE TYPE "public"."media_asset_status" AS ENUM('ready', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'awaiting_dns', 'verifying', 'misconfigured', 'active', 'degraded');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('business', 'content', 'brand', 'domain', 'review');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('initial_build', 'redesign');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('onboarding', 'submitted', 'building', 'preview', 'revisions', 'approved', 'live', 'on_hold', 'cancelled');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"purpose" "media_asset_purpose" NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt_text" text,
	"status" "media_asset_status" NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"closed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "business_hours_day_of_week_check" CHECK ("business_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "business_hours_open_times_check" CHECK ("business_hours"."closed" or ("business_hours"."opens_at" is not null and "business_hours"."closes_at" is not null and "business_hours"."opens_at" < "business_hours"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text,
	"description" text,
	"phone" text,
	"email" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"service_areas" text,
	"google_business_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"owner_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_briefs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"notes_for_builder" text,
	"style_likes" text,
	"reference_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"price_text" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"step" "onboarding_step" NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_project_id_step_pk" PRIMARY KEY("project_id","step")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" "project_kind" DEFAULT 'initial_build' NOT NULL,
	"status" "project_status" DEFAULT 'onboarding' NOT NULL,
	"onboarding_submitted_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone,
	"on_hold_reason" text,
	"revision_rounds_included" integer DEFAULT 2 NOT NULL,
	"revision_rounds_granted" integer DEFAULT 0 NOT NULL,
	"launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_business_id_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_business_purpose_created_idx" ON "media_assets" USING btree ("business_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "business_hours_business_id_idx" ON "business_hours" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_live_hostname_idx" ON "domains" USING btree (lower("hostname")) WHERE "domains"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_one_primary_per_business_idx" ON "domains" USING btree ("business_id") WHERE "domains"."is_primary" and "domains"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "services_business_id_position_idx" ON "services" USING btree ("business_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_one_open_per_business_idx" ON "projects" USING btree ("business_id") WHERE "projects"."status" not in ('live', 'cancelled');--> statement-breakpoint
-- Businesses created before projects existed start at onboarding, like every new one.
INSERT INTO projects (id, business_id, kind, status)
SELECT gen_random_uuid(), b.id, 'initial_build', 'onboarding'
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.business_id = b.id);