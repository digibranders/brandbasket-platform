-- Reviews and comments are deleted when their writer erases them (0156), so the erased_at columns that marked anonymous
-- rows are no longer written; 0156 deleted the rows they marked. They were kept for one release so the app running during
-- that deploy never met a missing column. A review always has its writer's number again, as before visitor erasure (0152).
ALTER TABLE "directory_review_comments" DROP CONSTRAINT "directory_review_comments_author_check";--> statement-breakpoint
ALTER TABLE "directory_reviews" DROP CONSTRAINT "directory_reviews_erased_check";--> statement-breakpoint
ALTER TABLE "directory_reviews" DROP CONSTRAINT "directory_reviews_phone_check";--> statement-breakpoint
ALTER TABLE "directory_reviews" ALTER COLUMN "phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_review_comments" DROP COLUMN "erased_at";--> statement-breakpoint
ALTER TABLE "directory_reviews" DROP COLUMN "erased_at";--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_author_check" CHECK (("directory_review_comments"."author_kind" = 'visitor' and "directory_review_comments"."phone" is not null and "directory_review_comments"."owner_user_id" is null and "directory_review_comments"."edited_at" is null) or ("directory_review_comments"."author_kind" = 'owner' and "directory_review_comments"."phone" is null and "directory_review_comments"."owner_user_id" is not null));--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_phone_check" CHECK ("directory_reviews"."phone" ~ '^\+[0-9]{8,15}$');