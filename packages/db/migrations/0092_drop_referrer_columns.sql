-- The referrer and reward now live on the affiliate (0091 copied them there), and Razorpay Offers are retired in
-- favour of discounted Razorpay plans, so a code no longer carries a referrer, a reward or an offer id.
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_reward_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_referrer_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_offer_id_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "provider_offer_id";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "referrer_name";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "referrer_email";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "reward_kind";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "reward_amount_cents";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP COLUMN "reward_percent_basis_points";