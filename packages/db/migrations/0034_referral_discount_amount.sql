-- The referral discount becomes a flat amount in the code's own currency instead of a percentage of the plan.
-- A flat amount needs no division, so it can never land on a fraction of a minor unit, and it says plainly what
-- a customer saves. The Razorpay Offer behind each code must be a flat-amount offer to match.
--
-- Unlike the reward in 0031, this conversion is exact and meaningful: a percentage was always a percentage OF the
-- currency's active plan, so that plan's price is the basis. Existing codes are backfilled from it below. A code
-- whose currency has no active plan keeps 0 and is caught by the check constraint added in 0035, which is what
-- should happen: such a code could not have been charged anyway.
ALTER TABLE "referral_codes" ADD COLUMN "discount_amount_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

UPDATE referral_codes rc
SET discount_amount_cents = (p.initial_amount_cents * rc.discount_percent) / 100
FROM plans p
WHERE p.currency = rc.currency AND p.active AND rc.discount_amount_cents = 0;
