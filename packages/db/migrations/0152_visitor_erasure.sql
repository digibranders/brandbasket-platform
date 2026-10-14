ALTER TABLE "directory_enquiries" DROP CONSTRAINT "directory_enquiries_phone_check";--> statement-breakpoint
ALTER TABLE "directory_review_comments" DROP CONSTRAINT "directory_review_comments_author_check";--> statement-breakpoint
ALTER TABLE "directory_reviews" DROP CONSTRAINT "directory_reviews_phone_check";--> statement-breakpoint
ALTER TABLE "privacy_requests" DROP CONSTRAINT "privacy_requests_kind_check";--> statement-breakpoint
ALTER TABLE "directory_enquiries" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_reviews" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD CONSTRAINT "directory_enquiries_erased_check" CHECK ("directory_enquiries"."phone" is not null or "directory_enquiries"."erased_at" is not null);--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD CONSTRAINT "directory_enquiries_phone_check" CHECK ("directory_enquiries"."phone" is null or "directory_enquiries"."phone" ~ '^\+[0-9]{8,15}$');--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_author_check" CHECK (("directory_review_comments"."author_kind" = 'visitor' and ("directory_review_comments"."phone" is not null or "directory_review_comments"."erased_at" is not null) and "directory_review_comments"."owner_user_id" is null and "directory_review_comments"."edited_at" is null) or ("directory_review_comments"."author_kind" = 'owner' and "directory_review_comments"."phone" is null and "directory_review_comments"."owner_user_id" is not null));--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_erased_check" CHECK ("directory_reviews"."phone" is not null or "directory_reviews"."erased_at" is not null);--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_phone_check" CHECK ("directory_reviews"."phone" is null or "directory_reviews"."phone" ~ '^\+[0-9]{8,15}$');--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_kind_check" CHECK ("privacy_requests"."kind" in ('access', 'correction', 'erasure', 'visitor_erasure', 'nomination', 'grievance', 'listing_removal', 'content_report'));