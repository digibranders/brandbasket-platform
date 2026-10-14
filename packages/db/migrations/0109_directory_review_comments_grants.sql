-- Grants and row-level security for comments on directory reviews (0108), in the same pattern as the reviews themselves
-- (0055). Staff-only: the marketing website holds no database credentials and reaches comments only through the
-- platform's /api/directory/* routes, which run on the staff connection, and nothing here is ever shown in the customer
-- dashboard. So fynix_app and fynix_public get nothing, and the only policy is fynix_staff's.
--
-- The comment route inserts a comment, the staff console hides and restores one. No DELETE: a comment is hidden, never
-- removed, so its history stays with the phone that left it. The new columns on directory_reviews (helpful_count) and
-- directory_review_otps (review_id) are covered by those tables' own grants.
GRANT SELECT, INSERT, UPDATE ON directory_review_comments TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_review_comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_review_comments_staff_all ON directory_review_comments FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
