-- The percentage is gone; 0034 backfilled every code from it. The new check only asserts the discount is
-- positive: its upper bound is the plan price, which this table cannot see, so the admin form enforces that half.
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_percent_check";--> statement-breakpoint
ALTER TABLE "referral_codes" ALTER COLUMN "discount_amount_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "discount_percent";--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_discount_check" CHECK ("referral_codes"."discount_amount_cents" > 0);