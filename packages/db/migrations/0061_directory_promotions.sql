-- Paid listing tags ("Hot & New", "Most Searched", "Popular Near You"; always shown with an "Ad" marker): a week of
-- one tag is a `listing_promotion` charge, and paying it writes a directory_promotions row. charges.promotion_tag says
-- which tag an open promotion charge buys. drizzle-kit's DDL, unchanged; grants, row-level security and the
-- no-overlap trigger are in 0062.
CREATE TYPE "public"."directory_paid_tag" AS ENUM('hot_new', 'most_searched', 'popular_near_you');--> statement-breakpoint
CREATE TABLE "directory_promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"tag" "directory_paid_tag" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"charge_id" uuid NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_promotions_charge_id_key" UNIQUE("charge_id"),
	CONSTRAINT "directory_promotions_business_id_starts_at_key" UNIQUE("business_id","starts_at"),
	CONSTRAINT "directory_promotions_week_check" CHECK ("directory_promotions"."ends_at" = "directory_promotions"."starts_at" + interval '7 days')
);
--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "promotion_tag" "directory_paid_tag";--> statement-breakpoint
ALTER TABLE "directory_promotions" ADD CONSTRAINT "directory_promotions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_promotions" ADD CONSTRAINT "directory_promotions_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_promotions_business_id_ends_at_idx" ON "directory_promotions" USING btree ("business_id","ends_at");--> statement-breakpoint
CREATE INDEX "directory_promotions_ends_at_idx" ON "directory_promotions" USING btree ("ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_one_open_listing_promotion_idx" ON "charges" USING btree ("business_id") WHERE "charges"."kind" = 'listing_promotion' and "charges"."status" = 'open';--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_promotion_tag_check" CHECK (("charges"."kind" = 'listing_promotion') = ("charges"."promotion_tag" is not null));--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_promotion_currency_check" CHECK ("charges"."kind" <> 'listing_promotion' or "charges"."currency" = 'INR');