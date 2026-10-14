-- The referrer's reward moves from a fixed amount to a share of each payment (see 0032). A fixed amount and a
-- percentage have no meaningful conversion between them without knowing which price the amount was a share of, so
-- the old column is dropped outright rather than migrated: every existing code's reward must be set again by hand
-- in the staff console. When this was written the dev database held one referral code and there was no production
-- deployment.
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_reward_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "reward_amount_cents";