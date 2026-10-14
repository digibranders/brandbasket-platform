-- reward_percent: the referrer's share of what the referred customer actually pays each month, the discounted
-- amount, not the plan's list price, so a reward can never exceed the revenue it came from. Whole percentages
-- only; the fraction of a minor unit this can leave is rounded down where it is computed (rewardAmountFor in
-- packages/billing), because no provider compares against this figure.
--
-- Unlike discount_percent, this is editable for the code's whole life: nothing at Razorpay knows about it, so
-- changing it only affects what is accrued afterwards. Defaults to 0, which is a pure discount code owing nobody.
ALTER TABLE "referral_codes" ADD COLUMN "reward_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_reward_check" CHECK ("referral_codes"."reward_percent" between 0 and 99);