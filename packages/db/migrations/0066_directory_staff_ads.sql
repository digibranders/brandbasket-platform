-- Ads staff place by hand for a business that asked for one (docs/superpowers/specs/2026-09-30-directory-ads-auction-
-- design.md, "Staff-placed ads"): any listing, any market, the spot and week staff chose, with no account, bid or
-- charge. drizzle-kit's DDL, unchanged; grants and the spot rules are in 0067.
CREATE TABLE "directory_staff_ads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_key" text NOT NULL,
	"business_name" text NOT NULL,
	"tagline" text,
	"category_slug" text NOT NULL,
	"city_slug" text NOT NULL,
	"area_slug" text NOT NULL,
	"placement" "directory_ad_placement" NOT NULL,
	"spot" smallint NOT NULL,
	"week_start" date NOT NULL,
	"agreed_paise" integer,
	"note" text,
	"placed_by_user_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_staff_ads_listing_key_check" CHECK (char_length("directory_staff_ads"."listing_key") <= 200 and "directory_staff_ads"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_staff_ads_business_name_check" CHECK (char_length("directory_staff_ads"."business_name") between 1 and 200),
	CONSTRAINT "directory_staff_ads_tagline_check" CHECK ("directory_staff_ads"."tagline" is null or (char_length("directory_staff_ads"."tagline") between 1 and 80 and "directory_staff_ads"."tagline" = btrim("directory_staff_ads"."tagline") and "directory_staff_ads"."tagline" !~ '[\r\n]')),
	CONSTRAINT "directory_staff_ads_market_check" CHECK ("directory_staff_ads"."category_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and "directory_staff_ads"."city_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and "directory_staff_ads"."area_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_staff_ads_week_start_check" CHECK (extract(isodow from "directory_staff_ads"."week_start") = 1),
	CONSTRAINT "directory_staff_ads_spot_check" CHECK (("directory_staff_ads"."placement" = 'top' and "directory_staff_ads"."spot" = 1) or ("directory_staff_ads"."placement" = 'side' and "directory_staff_ads"."spot" between 1 and 2)),
	CONSTRAINT "directory_staff_ads_agreed_check" CHECK ("directory_staff_ads"."agreed_paise" is null or ("directory_staff_ads"."agreed_paise" between 0 and 10000000 and "directory_staff_ads"."agreed_paise" % 100 = 0)),
	CONSTRAINT "directory_staff_ads_note_check" CHECK ("directory_staff_ads"."note" is null or (char_length("directory_staff_ads"."note") between 1 and 200 and "directory_staff_ads"."note" = btrim("directory_staff_ads"."note"))),
	CONSTRAINT "directory_staff_ads_removed_check" CHECK (("directory_staff_ads"."removed_at" is null) = ("directory_staff_ads"."removed_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_placed_by_user_id_users_id_fk" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_staff_ads_one_live_per_spot_idx" ON "directory_staff_ads" USING btree ("category_slug","city_slug","area_slug","placement","week_start","spot") WHERE "directory_staff_ads"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "directory_staff_ads_week_start_idx" ON "directory_staff_ads" USING btree ("week_start");