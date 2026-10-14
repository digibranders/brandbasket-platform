-- Grants and row-level security for the home and business-page ad spots (0090). Staff only, like directory_daily_counts:
-- the customer role and fynix_public get nothing. Advertisers see the prices and their results through the
-- platform, which reads them on the staff connection after checking who is asking. Staff may delete a spot price
-- (closing that placement to new bids) and the platform purges old daily counts.
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_ad_spot_prices TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_ad_spot_prices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_ad_spot_prices_staff_all ON directory_ad_spot_prices FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON directory_ad_daily_counts TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_ad_daily_counts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_ad_daily_counts_staff_all ON directory_ad_daily_counts FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
