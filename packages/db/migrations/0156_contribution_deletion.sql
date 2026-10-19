ALTER TABLE "privacy_requests" DROP CONSTRAINT "privacy_requests_kind_check";--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_kind_check" CHECK ("privacy_requests"."kind" in ('access', 'correction', 'erasure', 'visitor_erasure', 'contribution_deletion', 'nomination', 'grievance', 'listing_removal', 'content_report'));--> statement-breakpoint
-- A visitor may now delete their own review or comment, and erasing a visitor deletes them (N13 in the privacy plan), so the
-- staff connection that runs those routes may delete both. Until now a review or comment was only ever hidden.
GRANT DELETE ON directory_reviews, directory_review_comments TO bb_staff;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bb_staff') THEN
    GRANT DELETE ON directory_reviews, directory_review_comments TO bb_staff;
  END IF;
END $$;
--> statement-breakpoint
-- Reviews and comments erased before this release were kept as anonymous rows (stars still counted). Erasure now deletes
-- them outright, with every comment under a deleted review, so the rows already erased go the same way.
DELETE FROM "directory_review_otps" WHERE "review_id" IN (SELECT "id" FROM "directory_reviews" WHERE "erased_at" IS NOT NULL);--> statement-breakpoint
DELETE FROM "directory_review_comments" WHERE "review_id" IN (SELECT "id" FROM "directory_reviews" WHERE "erased_at" IS NOT NULL);--> statement-breakpoint
DELETE FROM "directory_reviews" WHERE "erased_at" IS NOT NULL;--> statement-breakpoint
DELETE FROM "directory_review_comments" WHERE "erased_at" IS NOT NULL;
