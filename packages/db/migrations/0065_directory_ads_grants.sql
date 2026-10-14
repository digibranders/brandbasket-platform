-- Grants and row-level security for the ad auction's tables (0064), in the same pattern as 0062. The customer reads
-- its own claim, bids and wins and every category's price, and writes nothing: claiming, bidding, changing the
-- tagline and settling all run on the staff connection after the platform has checked the customer (or, for
-- settlement, from the clock alone). fynix_public gets nothing: the website reads this week's ads through the
-- platform's GET /api/directory/ads on the staff connection.
--
-- No DELETE for anyone on claims, bids and wins: they stay on record, a win with the charge that asked for it. Staff may
-- delete a price, which closes that category to new bids.

GRANT SELECT ON directory_claims TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_claims TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_claims ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_claims_tenant_read ON directory_claims FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_claims_staff_all ON directory_claims FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Prices are the same for everyone and shown to every advertiser.
GRANT SELECT ON directory_ad_prices TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON directory_ad_prices TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_ad_prices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_ad_prices_read ON directory_ad_prices FOR SELECT TO fynix_app USING (true);
--> statement-breakpoint

CREATE POLICY directory_ad_prices_staff_all ON directory_ad_prices FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- A bid is sealed: the customer sees only its own.
GRANT SELECT ON directory_ad_bids TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_ad_bids TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_ad_bids ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_ad_bids_tenant_read ON directory_ad_bids FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_ad_bids_staff_all ON directory_ad_bids FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT ON directory_ad_wins TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_ad_wins TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_ad_wins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_ad_wins_tenant_read ON directory_ad_wins FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_ad_wins_staff_all ON directory_ad_wins FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- A win belongs to the business whose bid won it, in that bid's auction: checked here so no writer can pair a bid
-- with someone else's spot.
CREATE FUNCTION directory_ad_wins_match_bid() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.directory_ad_bids AS bid
    WHERE bid.id = NEW.bid_id
      AND bid.business_id = NEW.business_id
      AND bid.listing_key = NEW.listing_key
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

CREATE TRIGGER directory_ad_wins_match_bid
  BEFORE INSERT OR UPDATE OF bid_id, business_id, listing_key, category_slug, city_slug, area_slug, placement, week_start, price_paise
  ON directory_ad_wins
  FOR EACH ROW EXECUTE FUNCTION directory_ad_wins_match_bid();
