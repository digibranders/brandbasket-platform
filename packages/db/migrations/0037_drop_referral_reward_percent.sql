-- The percentage is gone; 0036 backfilled every code from it at the same value. The reward keeps its default
-- of 0, which is a code that owes nobody, and the check only asserts it is not negative.
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_reward_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "reward_percent";--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_reward_check" CHECK ("referral_codes"."reward_amount_cents" >= 0);