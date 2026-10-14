-- The referrer's reward becomes a flat amount too, matching the discount. Nothing is computed from it any more,
-- so the rounding rule that came with a percentage (round down, never accrue a fraction) is no longer needed.
--
-- The conversion is exact: the percentage was always a share of what the customer actually paid, which is the
-- currency's active plan less this code's own discount. Integer division truncates, which is the same rounding
-- down that rewardAmountFor applied, so no code's reward changes value here. A code whose currency has no active
-- plan keeps 0, which is a valid reward meaning nobody is paid.
ALTER TABLE "referral_codes" ADD COLUMN "reward_amount_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE referral_codes rc
SET reward_amount_cents = (rc.reward_percent * (p.initial_amount_cents - rc.discount_amount_cents)) / 100
FROM plans p
WHERE p.currency = rc.currency
  AND p.active
  AND rc.reward_amount_cents = 0
  AND p.initial_amount_cents > rc.discount_amount_cents;
