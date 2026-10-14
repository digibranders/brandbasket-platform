-- Ad spots on the home page and on business pages (docs/superpowers/specs/2026-10-07-ad-spots-and-reports-design.md):
-- the prices for those placements, the daily counts of who saw and clicked each ad, and the spot rules for the new
-- placements. drizzle-kit's DDL, unchanged; grants and row-level security are in 0091.
CREATE TABLE "directory_ad_daily_counts" (
	"place_id" text NOT NULL,
	"placement" "directory_ad_placement" NOT NULL,
	"day" date NOT NULL,
	"kind" "directory_ad_event_kind" NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "directory_ad_daily_counts_pkey" PRIMARY KEY("place_id","placement","day","kind"),
	CONSTRAINT "directory_ad_daily_counts_count_check" CHECK ("directory_ad_daily_counts"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "directory_ad_spot_prices" (
	"scope_slug" text NOT NULL,
	"placement" "directory_ad_placement" NOT NULL,
	"week_paise" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_ad_spot_prices_pkey" PRIMARY KEY("scope_slug","placement"),
	CONSTRAINT "directory_ad_spot_prices_scope_slug_check" CHECK ("directory_ad_spot_prices"."scope_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_ad_spot_prices_placement_check" CHECK (("directory_ad_spot_prices"."placement" = 'home' and "directory_ad_spot_prices"."scope_slug" = 'all') or ("directory_ad_spot_prices"."placement" = 'profile' and "directory_ad_spot_prices"."scope_slug" <> 'all')),
	CONSTRAINT "directory_ad_spot_prices_amount_check" CHECK ("directory_ad_spot_prices"."week_paise" between 10000 and 10000000 and "directory_ad_spot_prices"."week_paise" % 100 = 0)
);
--> statement-breakpoint
ALTER TABLE "directory_ad_bids" DROP CONSTRAINT "directory_ad_bids_market_check";--> statement-breakpoint
ALTER TABLE "directory_ad_wins" DROP CONSTRAINT "directory_ad_wins_spot_check";--> statement-breakpoint
ALTER TABLE "directory_staff_ads" DROP CONSTRAINT "directory_staff_ads_spot_check";--> statement-breakpoint
ALTER TABLE "directory_ad_daily_counts" ADD CONSTRAINT "directory_ad_daily_counts_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_spot_prices" ADD CONSTRAINT "directory_ad_spot_prices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_ad_daily_counts_day_idx" ON "directory_ad_daily_counts" USING btree ("day");--> statement-breakpoint
ALTER TABLE "directory_ad_bids" ADD CONSTRAINT "directory_ad_bids_market_check" CHECK (case "directory_ad_bids"."placement"
        when 'home' then "directory_ad_bids"."category_slug" = 'all' and "directory_ad_bids"."area_slug" = 'all' and "directory_ad_bids"."listing_key" like '%/' || "directory_ad_bids"."city_slug" || '/%/%'
        else "directory_ad_bids"."listing_key" like "directory_ad_bids"."category_slug" || '/' || "directory_ad_bids"."city_slug" || '/' || "directory_ad_bids"."area_slug" || '/%'
      end);--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD CONSTRAINT "directory_ad_wins_spot_check" CHECK (("directory_ad_wins"."placement" = 'top' and "directory_ad_wins"."spot" between 1 and 1) or ("directory_ad_wins"."placement" = 'side' and "directory_ad_wins"."spot" between 1 and 2) or ("directory_ad_wins"."placement" = 'profile' and "directory_ad_wins"."spot" between 1 and 1) or ("directory_ad_wins"."placement" = 'home' and "directory_ad_wins"."spot" between 1 and 4));--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_spot_check" CHECK (("directory_staff_ads"."placement" = 'top' and "directory_staff_ads"."spot" between 1 and 1) or ("directory_staff_ads"."placement" = 'side' and "directory_staff_ads"."spot" between 1 and 2) or ("directory_staff_ads"."placement" = 'profile' and "directory_staff_ads"."spot" between 1 and 1) or ("directory_staff_ads"."placement" = 'home' and "directory_staff_ads"."spot" between 1 and 4));
