-- Grants and row-level security for the local directory's reviews and enquiries (0054), in the same pattern as 0042
-- and 0051. Staff-only, like booking_otps: the marketing website holds no database credentials and reaches these
-- tables only through the platform's /api/directory/* routes, which run on the staff connection, and nothing here is
-- ever shown in the customer dashboard. So fynix_app and fynix_public get nothing, and the only policy is
-- fynix_staff's.
--
-- directory_reviews: the confirm route inserts or replaces a review (the upsert updates it), the staff console hides
-- and restores one. No DELETE: a review is hidden, never removed, so its history stays with the phone that left it.
GRANT SELECT, INSERT, UPDATE ON directory_reviews TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_reviews_staff_all ON directory_reviews FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- directory_review_otps: created, attempted, verified and deleted by the review routes, and purged an hour after
-- expiry, exactly like booking_otps.
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_review_otps TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_review_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_review_otps_staff_all ON directory_review_otps FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- directory_enquiries: inserted by the enquiry route, marked handled from the staff console. No DELETE.
GRANT SELECT, INSERT, UPDATE ON directory_enquiries TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_enquiries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_enquiries_staff_all ON directory_enquiries FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
