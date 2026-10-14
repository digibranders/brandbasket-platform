-- The Business profile (docs/superpowers/specs/2026-10-01-business-profile-design.md): one row per free listing
-- account holding what its owner types on the Details tab, and the moment the owner of an added business published it
-- themselves (published_at), with no call from us. drizzle-kit's DDL, unchanged; the grants and row-level security for
-- the new table are in 0081, and directory_claims' own (0065) cover the new column.
CREATE TABLE "directory_business_profiles" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"street_address" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp" text,
	"maps_url" text,
	"latitude" double precision,
	"longitude" double precision,
	"website_url" text,
	"about" text,
	"youtube_video_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_business_profiles_street_address_check" CHECK (char_length("directory_business_profiles"."street_address") between 1 and 200 and "directory_business_profiles"."street_address" = btrim("directory_business_profiles"."street_address") and "directory_business_profiles"."street_address" !~ '[\r\n]'),
	CONSTRAINT "directory_business_profiles_phone_check" CHECK ("directory_business_profiles"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_business_profiles_whatsapp_check" CHECK ("directory_business_profiles"."whatsapp" is null or "directory_business_profiles"."whatsapp" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_business_profiles_maps_url_check" CHECK ("directory_business_profiles"."maps_url" is null or (char_length("directory_business_profiles"."maps_url") <= 500 and "directory_business_profiles"."maps_url" ~ '^https://[^[:space:]]+$')),
	CONSTRAINT "directory_business_profiles_pin_check" CHECK (("directory_business_profiles"."latitude" is null) = ("directory_business_profiles"."longitude" is null) and ("directory_business_profiles"."latitude" is null or ("directory_business_profiles"."latitude" between -90 and 90 and "directory_business_profiles"."longitude" between -180 and 180))),
	CONSTRAINT "directory_business_profiles_website_url_check" CHECK ("directory_business_profiles"."website_url" is null or (char_length("directory_business_profiles"."website_url") <= 300 and "directory_business_profiles"."website_url" ~ '^https?://[^[:space:]]+$')),
	CONSTRAINT "directory_business_profiles_about_check" CHECK ("directory_business_profiles"."about" is null or (char_length("directory_business_profiles"."about") between 1 and 500 and "directory_business_profiles"."about" = btrim("directory_business_profiles"."about"))),
	CONSTRAINT "directory_business_profiles_youtube_video_id_check" CHECK ("directory_business_profiles"."youtube_video_id" is null or "directory_business_profiles"."youtube_video_id" ~ '^[A-Za-z0-9_-]{11}$')
);
--> statement-breakpoint
ALTER TABLE "directory_claims" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_published_check" CHECK ("directory_claims"."published_at" is null or ("directory_claims"."origin" = 'added' and "directory_claims"."status" <> 'pending'));