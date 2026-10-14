-- Pricing change (2026-09-17): changes are charged by the hour after a free first hour (once per customer), and blog
-- posts after the first 100 are sold in blocks of 100. The column defaults are the USD prices ($15 an hour, $5 per
-- 100 posts); the INR plan gets its own amounts below, at Rs 95 to US$1 (Rs 1,425 an hour, Rs 475 per 100 posts).
-- included_publishes_per_month and extra_publish_amount_cents are kept for now: the planned publish workflow still
-- refers to them and is due to be redesigned around these prices.
ALTER TABLE "plans" ADD COLUMN "included_change_hours" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "extra_hour_amount_cents" integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "included_blog_posts" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "blog_post_block_size" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "extra_blog_posts_amount_cents" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
UPDATE plans SET extra_hour_amount_cents = 142500, extra_blog_posts_amount_cents = 47500, updated_at = now() WHERE code = 'care-inr';
