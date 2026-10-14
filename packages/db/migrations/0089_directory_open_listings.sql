-- The /in directory's open-data and surveyed businesses (docs/superpowers/plans/2026-10-06-directory-listings-in-database.md),
-- loaded by `pnpm directory:import-listings`. Needs f_unaccent from 0088. drizzle-kit's DDL, unchanged; the grants and
-- row-level security are in 0090.
CREATE TYPE "public"."directory_open_listing_source" AS ENUM('osm', 'overture', 'survey');--> statement-breakpoint
CREATE TABLE "directory_open_listings" (
	"place_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_slug" text NOT NULL,
	"city_slug" text NOT NULL,
	"area_slug" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"source" "directory_open_listing_source" NOT NULL,
	"phone" text,
	"phone_found_on" text,
	"phone_checked_on" date,
	"phone_whatsapp" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', f_unaccent(coalesce(name, ''))), 'A') || setweight(to_tsvector('simple', replace(category_slug, '-', ' ')), 'B') || setweight(to_tsvector('simple', replace(area_slug || ' ' || city_slug, '-', ' ')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_open_listings_name_check" CHECK (char_length("directory_open_listings"."name") between 1 and 200),
	CONSTRAINT "directory_open_listings_category_slug_check" CHECK ("directory_open_listings"."category_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_open_listings_city_slug_check" CHECK ("directory_open_listings"."city_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_open_listings_area_slug_check" CHECK ("directory_open_listings"."area_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_open_listings_point_check" CHECK ("directory_open_listings"."lat" between -90 and 90 and "directory_open_listings"."lon" between -180 and 180),
	CONSTRAINT "directory_open_listings_phone_check" CHECK (("directory_open_listings"."phone" is null and "directory_open_listings"."phone_found_on" is null and "directory_open_listings"."phone_checked_on" is null)
        or ("directory_open_listings"."phone" ~ '^\+91[1-9][0-9]{9}$' and "directory_open_listings"."phone_checked_on" is not null
          and ("directory_open_listings"."phone_found_on" = 'call' or "directory_open_listings"."phone_found_on" ~ '^https?://')))
);
--> statement-breakpoint
ALTER TABLE "directory_open_listings" ADD CONSTRAINT "directory_open_listings_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_open_listings_city_area_category_idx" ON "directory_open_listings" USING btree ("city_slug","area_slug","category_slug");--> statement-breakpoint
CREATE INDEX "directory_open_listings_search_idx" ON "directory_open_listings" USING gin ("search");--> statement-breakpoint
CREATE INDEX "directory_open_listings_name_trgm_idx" ON "directory_open_listings" USING gin (lower(f_unaccent("name")) gin_trgm_ops);