-- Free listing accounts and the weekly ad auction on Firstfold Local (docs/superpowers/specs/2026-09-30-directory-ads-
-- auction-design.md): businesses.kind, directory_claims, directory_ad_prices, directory_ad_bids, directory_ad_wins, and
-- the charges rules for a `directory_ad` charge (INR only; the auction may cancel it without a staff member when its
-- win lapses). drizzle-kit's DDL, unchanged; grants and row-level security are in 0065.
CREATE TYPE "public"."business_kind" AS ENUM('website', 'listing');--> statement-breakpoint
CREATE TYPE "public"."directory_ad_bid_status" AS ENUM('active', 'withdrawn', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."directory_ad_placement" AS ENUM('top', 'side');--> statement-breakpoint
CREATE TYPE "public"."directory_ad_win_status" AS ENUM('awaiting_payment', 'paid', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."directory_claim_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "directory_ad_bids" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"listing_key" text NOT NULL,
	"category_slug" text NOT NULL,
	"city_slug" text NOT NULL,
	"area_slug" text NOT NULL,
	"placement" "directory_ad_placement" NOT NULL,
	"week_start" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"amount_set_at" timestamp with time zone NOT NULL,
	"status" "directory_ad_bid_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_ad_bids_business_placement_week_key" UNIQUE("business_id","placement","week_start"),
	CONSTRAINT "directory_ad_bids_listing_key_check" CHECK (char_length("directory_ad_bids"."listing_key") <= 200 and "directory_ad_bids"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_ad_bids_market_check" CHECK ("directory_ad_bids"."listing_key" like "directory_ad_bids"."category_slug" || '/' || "directory_ad_bids"."city_slug" || '/' || "directory_ad_bids"."area_slug" || '/%'),
	CONSTRAINT "directory_ad_bids_week_start_check" CHECK (extract(isodow from "directory_ad_bids"."week_start") = 1),
	CONSTRAINT "directory_ad_bids_amount_check" CHECK ("directory_ad_bids"."amount_paise" between 10000 and 10000000 and "directory_ad_bids"."amount_paise" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "directory_ad_prices" (
	"category_slug" text PRIMARY KEY NOT NULL,
	"top_week_paise" integer NOT NULL,
	"side_week_paise" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_ad_prices_category_slug_check" CHECK ("directory_ad_prices"."category_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_ad_prices_amounts_check" CHECK ("directory_ad_prices"."top_week_paise" between 10000 and 10000000 and "directory_ad_prices"."top_week_paise" % 100 = 0 and "directory_ad_prices"."side_week_paise" between 10000 and 10000000 and "directory_ad_prices"."side_week_paise" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "directory_ad_wins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bid_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"listing_key" text NOT NULL,
	"category_slug" text NOT NULL,
	"city_slug" text NOT NULL,
	"area_slug" text NOT NULL,
	"placement" "directory_ad_placement" NOT NULL,
	"week_start" date NOT NULL,
	"spot" smallint NOT NULL,
	"price_paise" integer NOT NULL,
	"charge_id" uuid NOT NULL,
	"status" "directory_ad_win_status" DEFAULT 'awaiting_payment' NOT NULL,
	"pay_by" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"lapsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_ad_wins_bid_id_key" UNIQUE("bid_id"),
	CONSTRAINT "directory_ad_wins_charge_id_key" UNIQUE("charge_id"),
	CONSTRAINT "directory_ad_wins_week_start_check" CHECK (extract(isodow from "directory_ad_wins"."week_start") = 1),
	CONSTRAINT "directory_ad_wins_spot_check" CHECK (("directory_ad_wins"."placement" = 'top' and "directory_ad_wins"."spot" = 1) or ("directory_ad_wins"."placement" = 'side' and "directory_ad_wins"."spot" between 1 and 2)),
	CONSTRAINT "directory_ad_wins_price_check" CHECK ("directory_ad_wins"."price_paise" between 10000 and 10000000),
	CONSTRAINT "directory_ad_wins_status_check" CHECK (case "directory_ad_wins"."status"
        when 'awaiting_payment' then "directory_ad_wins"."paid_at" is null and "directory_ad_wins"."lapsed_at" is null
        when 'paid' then "directory_ad_wins"."paid_at" is not null and "directory_ad_wins"."lapsed_at" is null
        else "directory_ad_wins"."paid_at" is null and "directory_ad_wins"."lapsed_at" is not null
      end)
);
--> statement-breakpoint
CREATE TABLE "directory_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"listing_key" text NOT NULL,
	"business_name" text NOT NULL,
	"phone" text NOT NULL,
	"status" "directory_claim_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"tagline" text,
	"tagline_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_claims_business_id_key" UNIQUE("business_id"),
	CONSTRAINT "directory_claims_listing_key_check" CHECK (char_length("directory_claims"."listing_key") <= 200 and "directory_claims"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_claims_business_name_check" CHECK (char_length("directory_claims"."business_name") between 1 and 200),
	CONSTRAINT "directory_claims_phone_check" CHECK ("directory_claims"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_claims_decided_check" CHECK (("directory_claims"."status" = 'pending') = ("directory_claims"."decided_at" is null) and ("directory_claims"."decided_at" is null) = ("directory_claims"."decided_by_user_id" is null)),
	CONSTRAINT "directory_claims_tagline_check" CHECK ("directory_claims"."tagline" is null or (char_length("directory_claims"."tagline") between 1 and 80 and "directory_claims"."tagline" = btrim("directory_claims"."tagline") and "directory_claims"."tagline" !~ '[\r\n]')),
	CONSTRAINT "directory_claims_tagline_approved_check" CHECK ("directory_claims"."tagline" is not null or not "directory_claims"."tagline_approved")
);
--> statement-breakpoint
ALTER TABLE "charges" DROP CONSTRAINT "charges_status_check";--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "kind" "business_kind" DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_ad_bids" ADD CONSTRAINT "directory_ad_bids_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_prices" ADD CONSTRAINT "directory_ad_prices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD CONSTRAINT "directory_ad_wins_bid_id_directory_ad_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."directory_ad_bids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD CONSTRAINT "directory_ad_wins_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD CONSTRAINT "directory_ad_wins_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_ad_bids_status_week_start_idx" ON "directory_ad_bids" USING btree ("status","week_start");--> statement-breakpoint
CREATE INDEX "directory_ad_bids_auction_idx" ON "directory_ad_bids" USING btree ("category_slug","city_slug","area_slug","placement","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_ad_wins_one_live_per_spot_idx" ON "directory_ad_wins" USING btree ("category_slug","city_slug","area_slug","placement","week_start","spot") WHERE "directory_ad_wins"."status" <> 'lapsed';--> statement-breakpoint
CREATE INDEX "directory_ad_wins_market_week_idx" ON "directory_ad_wins" USING btree ("category_slug","city_slug","area_slug","week_start");--> statement-breakpoint
CREATE INDEX "directory_ad_wins_status_pay_by_idx" ON "directory_ad_wins" USING btree ("status","pay_by");--> statement-breakpoint
CREATE INDEX "directory_ad_wins_business_id_idx" ON "directory_ad_wins" USING btree ("business_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_claims_one_approved_per_listing_idx" ON "directory_claims" USING btree ("listing_key") WHERE "directory_claims"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "directory_claims_status_created_at_idx" ON "directory_claims" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_directory_ad_currency_check" CHECK ("charges"."kind" <> 'directory_ad' or "charges"."currency" = 'INR');--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_status_check" CHECK (case "charges"."status"
        when 'open' then "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is null
        when 'paid' then "charges"."payment_id" is not null and "charges"."paid_at" is not null and "charges"."waived_at" is null
        else "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is not null and ("charges"."waived_by_staff_id" is not null or "charges"."kind" = 'directory_ad')
      end);