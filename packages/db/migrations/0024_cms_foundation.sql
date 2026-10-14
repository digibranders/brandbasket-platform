CREATE TYPE "public"."blog_post_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."site_release_creator" AS ENUM('staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."site_release_purpose" AS ENUM('preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."page_key" AS ENUM('home', 'about', 'services', 'gallery', 'reviews', 'contact');--> statement-breakpoint
CREATE TYPE "public"."section_type" AS ENUM('rich_text', 'image');--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cover_media_id" uuid,
	"status" "blog_post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"purpose" "site_release_purpose" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_type" "site_release_creator" NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_releases_business_id_number_unique" UNIQUE("business_id","number")
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"caption" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "page_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"type" "section_type" NOT NULL,
	"variant" text,
	"position" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"customer_editable" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_sections_id_business_id_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"key" "page_key" NOT NULL,
	"slug" text NOT NULL,
	"nav_label" text NOT NULL,
	"title" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_id_business_id_unique" UNIQUE("id","business_id"),
	CONSTRAINT "pages_business_id_key_unique" UNIQUE("business_id","key"),
	CONSTRAINT "pages_business_id_slug_unique" UNIQUE("business_id","slug")
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"template_key" text DEFAULT 'standard' NOT NULL,
	"blog_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_business_id_unique" UNIQUE("business_id"),
	CONSTRAINT "websites_id_business_id_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
-- Must precede the (media_id/cover_media_id, business_id) foreign keys below: they reference this composite
-- unique index, and Postgres requires it to exist first.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_id_business_id_unique" UNIQUE("id","business_id");--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_cover_media_business_fk" FOREIGN KEY ("cover_media_id","business_id") REFERENCES "public"."media_assets"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_releases" ADD CONSTRAINT "site_releases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_releases" ADD CONSTRAINT "site_releases_website_business_fk" FOREIGN KEY ("website_id","business_id") REFERENCES "public"."websites"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_media_business_fk" FOREIGN KEY ("media_id","business_id") REFERENCES "public"."media_assets"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_page_business_fk" FOREIGN KEY ("page_id","business_id") REFERENCES "public"."pages"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_website_business_fk" FOREIGN KEY ("website_id","business_id") REFERENCES "public"."websites"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_posts_business_id_slug_idx" ON "blog_posts" USING btree ("business_id","slug") WHERE "blog_posts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "blog_posts_business_id_status_idx" ON "blog_posts" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "site_releases_website_id_created_at_idx" ON "site_releases" USING btree ("website_id","created_at");--> statement-breakpoint
CREATE INDEX "gallery_items_business_id_position_idx" ON "gallery_items" USING btree ("business_id","position");--> statement-breakpoint
CREATE INDEX "page_sections_page_id_position_idx" ON "page_sections" USING btree ("page_id","position");--> statement-breakpoint
CREATE INDEX "pages_business_id_position_idx" ON "pages" USING btree ("business_id","position");