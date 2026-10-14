-- Permanent directory ids, writes by id (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md, Task 7):
-- the platform now writes place_id, and a request that names its business by id alone has no listing key to write.
-- drizzle-kit's DDL first, unchanged:
--   * directory_reviews, directory_review_otps and directory_daily_counts may go without listing_key; each row still
--     names its business, by place or by key (the new `_business_check`s). directory_enquiries' kind check takes a
--     place as well as a key.
--   * directory_daily_counts' primary key (listing_key, day, kind) becomes the unique constraint
--     directory_daily_counts_listing_key_day_kind_key on the same columns, still the conflict target of a count by
--     key; a count by place conflicts on directory_daily_counts_place_day_kind_idx (0077). The contract step makes
--     (place_id, day, kind) the primary key.
-- Left as they are, because every write still has a key: directory_verifications (staff verify at a page address, or
-- approve a claim, which has one), and claims, bids, wins and staff ads, whose key is also their ad market.
-- Then, by hand: a win must name its bid's place as it names its bid's listing key (0065's trigger, re-made).
ALTER TABLE "directory_enquiries" DROP CONSTRAINT "directory_enquiries_kind_check";--> statement-breakpoint
ALTER TABLE "directory_daily_counts" DROP CONSTRAINT "directory_daily_counts_pk";--> statement-breakpoint
ALTER TABLE "directory_daily_counts" ALTER COLUMN "listing_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_review_otps" ALTER COLUMN "listing_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_reviews" ALTER COLUMN "listing_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_daily_counts" ADD CONSTRAINT "directory_daily_counts_listing_key_day_kind_key" UNIQUE("listing_key","day","kind");--> statement-breakpoint
ALTER TABLE "directory_daily_counts" ADD CONSTRAINT "directory_daily_counts_business_check" CHECK ("directory_daily_counts"."listing_key" is not null or "directory_daily_counts"."place_id" is not null);--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD CONSTRAINT "directory_enquiries_kind_check" CHECK (("directory_enquiries"."kind" = 'business' and ("directory_enquiries"."listing_key" is not null or "directory_enquiries"."place_id" is not null) and "directory_enquiries"."business_name" is not null) or ("directory_enquiries"."kind" = 'top_list' and "directory_enquiries"."listing_key" is null and "directory_enquiries"."place_id" is null and "directory_enquiries"."business_name" is null));--> statement-breakpoint
ALTER TABLE "directory_review_otps" ADD CONSTRAINT "directory_review_otps_business_check" CHECK ("directory_review_otps"."listing_key" is not null or "directory_review_otps"."place_id" is not null);--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_business_check" CHECK ("directory_reviews"."listing_key" is not null or "directory_reviews"."place_id" is not null);
--> statement-breakpoint

-- A win belongs to the business whose bid won it, in that bid's auction, and to the bid's place: checked here so no
-- writer can pair a bid with someone else's spot. Settlement copies the bid's place_id; the backfill fills bids before
-- the wins that copy them. Both are null for a business the registry does not know.
CREATE OR REPLACE FUNCTION directory_ad_wins_match_bid() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.directory_ad_bids AS bid
    WHERE bid.id = NEW.bid_id
      AND bid.business_id = NEW.business_id
      AND bid.listing_key = NEW.listing_key
      AND bid.place_id IS NOT DISTINCT FROM NEW.place_id
      AND bid.category_slug = NEW.category_slug
      AND bid.city_slug = NEW.city_slug
      AND bid.area_slug = NEW.area_slug
      AND bid.placement = NEW.placement
      AND bid.week_start = NEW.week_start
      AND NEW.price_paise <= bid.amount_paise
  ) THEN
    RAISE EXCEPTION 'directory ad win % does not match its bid %', NEW.id, NEW.bid_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

DROP TRIGGER directory_ad_wins_match_bid ON directory_ad_wins;
--> statement-breakpoint

CREATE TRIGGER directory_ad_wins_match_bid
  BEFORE INSERT OR UPDATE OF bid_id, business_id, listing_key, place_id, category_slug, city_slug, area_slug, placement, week_start, price_paise
  ON directory_ad_wins
  FOR EACH ROW EXECUTE FUNCTION directory_ad_wins_match_bid();
