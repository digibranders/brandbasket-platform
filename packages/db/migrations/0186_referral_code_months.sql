ALTER TABLE "subscriptions" ADD COLUMN "discount_months_left" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "next_discount_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "discount_months" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_months_check" CHECK (("subscriptions"."discount_months_left" is null or "subscriptions"."discount_months_left" >= 0) and ("subscriptions"."next_discount_amount_cents" is null or "subscriptions"."next_discount_amount_cents" >= 0));--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_discount_months_check" CHECK ("referral_codes"."discount_months" is null or "referral_codes"."discount_months" between 1 and 120);