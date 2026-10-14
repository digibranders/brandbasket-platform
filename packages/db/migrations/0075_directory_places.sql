-- The directory's place registry (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md): one row per
-- business with its permanent id and locked URL label, the pre-id listing keys that 301 to it, and the audit trail of
-- staff URL changes. drizzle-kit's DDL, unchanged; the grants and row-level security are in 0076.
CREATE TYPE "public"."directory_place_origin" AS ENUM('open_data', 'client', 'added');--> statement-breakpoint
CREATE TABLE "directory_place_legacy_keys" (
	"listing_key" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	CONSTRAINT "directory_place_legacy_keys_listing_key_check" CHECK (char_length("directory_place_legacy_keys"."listing_key") <= 200 and "directory_place_legacy_keys"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$')
);
--> statement-breakpoint
CREATE TABLE "directory_place_url_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"from_city_slug" text NOT NULL,
	"from_url_slug" text NOT NULL,
	"to_city_slug" text NOT NULL,
	"to_url_slug" text NOT NULL,
	"reason" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "directory_place_url_changes_reason_check" CHECK (char_length("directory_place_url_changes"."reason") between 3 and 300)
);
--> statement-breakpoint
CREATE TABLE "directory_places" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" "directory_place_origin" NOT NULL,
	"source_ref" text,
	"state_code" text NOT NULL,
	"city_slug" text NOT NULL,
	"url_slug" text NOT NULL,
	"url_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_places_source_ref_key" UNIQUE("source_ref"),
	CONSTRAINT "directory_places_id_check" CHECK ("directory_places"."id" ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$' and "directory_places"."id" ~ '[2-9]'),
	CONSTRAINT "directory_places_origin_id_check" CHECK (("directory_places"."origin" = 'open_data') = ("directory_places"."id" ~ '^[a-z]') or "directory_places"."origin" = 'client'),
	CONSTRAINT "directory_places_state_code_check" CHECK ("directory_places"."state_code" ~ '^[a-z]{2}$'),
	CONSTRAINT "directory_places_city_slug_check" CHECK ("directory_places"."city_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_places_url_slug_check" CHECK ("directory_places"."url_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("directory_places"."url_slug") <= 70)
);
--> statement-breakpoint
ALTER TABLE "directory_place_legacy_keys" ADD CONSTRAINT "directory_place_legacy_keys_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_place_url_changes" ADD CONSTRAINT "directory_place_url_changes_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_place_url_changes" ADD CONSTRAINT "directory_place_url_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_place_legacy_keys_place_id_idx" ON "directory_place_legacy_keys" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "directory_place_url_changes_place_id_idx" ON "directory_place_url_changes" USING btree ("place_id","changed_at");