-- A business's verified owner can answer reviews and comments (docs/superpowers/specs/2026-10-12-directory-owner-replies-design.md).
-- A comment now says who wrote it: a visitor (confirmed by a texted number, as before) or the owner (signed in: an account,
-- no number, up to 500 characters instead of 300). Every existing row is a visitor's and keeps passing the new checks. The
-- table's staff-only grants and row-level security (0109) already cover the new columns.
-- Also: a profile's street address becomes optional. The owner of a business the directory already had (a claim) keeps the
-- directory's name, address and number, so its Business profile has no address of its own to store.
CREATE TYPE "public"."directory_comment_author" AS ENUM('visitor', 'owner');--> statement-breakpoint
ALTER TABLE "directory_review_comments" DROP CONSTRAINT "directory_review_comments_text_check";--> statement-breakpoint
ALTER TABLE "directory_review_comments" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD COLUMN "author_kind" "directory_comment_author" DEFAULT 'visitor' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_author_check" CHECK (("directory_review_comments"."author_kind" = 'visitor' and "directory_review_comments"."phone" is not null and "directory_review_comments"."owner_user_id" is null and "directory_review_comments"."edited_at" is null) or ("directory_review_comments"."author_kind" = 'owner' and "directory_review_comments"."phone" is null and "directory_review_comments"."owner_user_id" is not null));--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_text_check" CHECK (char_length("directory_review_comments"."text") between 1 and (case when "directory_review_comments"."author_kind" = 'owner' then 500 else 300 end));
--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ALTER COLUMN "street_address" DROP NOT NULL;
