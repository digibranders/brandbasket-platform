-- A referral code's discount, and its referrer's reward, may each be a flat amount (as before) or a percentage held
-- in basis points (1250 is 12.5%). Every existing code keeps its flat amounts: both kinds default to 'amount' and
-- the new percentage columns start null, which is exactly what the replacement checks require of an amount.
--
-- discount_amount_cents becomes nullable because a percentage code has no amount of its own; the money it is worth
-- is still worked out once at checkout and frozen onto subscriptions.discount_amount_cents, which is unchanged.
-- reward_amount_cents stays NOT NULL and holds 0 for a percentage reward, so "0 means nobody is paid" still reads
-- true of every amount row. The table's grants are table-level (0030, 0033), so the new columns need none.
--
-- The checks say "is not null" explicitly: a comparison with null is unknown, and a CHECK that evaluates to unknown
-- passes, so without it a row claiming a kind with no value stored at all would be accepted.
CREATE TYPE "public"."referral_value_kind" AS ENUM('amount', 'percent');--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_discount_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_reward_check";--> statement-breakpoint
ALTER TABLE "referral_codes" ALTER COLUMN "discount_amount_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "discount_kind" "referral_value_kind" DEFAULT 'amount' NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "discount_percent_basis_points" integer;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "reward_kind" "referral_value_kind" DEFAULT 'amount' NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "reward_percent_basis_points" integer;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_discount_check" CHECK (("referral_codes"."discount_kind" = 'amount' and "referral_codes"."discount_amount_cents" is not null and "referral_codes"."discount_amount_cents" > 0 and "referral_codes"."discount_percent_basis_points" is null) or ("referral_codes"."discount_kind" = 'percent' and "referral_codes"."discount_percent_basis_points" is not null and "referral_codes"."discount_percent_basis_points" between 1 and 9900 and "referral_codes"."discount_amount_cents" is null));--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_reward_check" CHECK (("referral_codes"."reward_kind" = 'amount' and "referral_codes"."reward_amount_cents" >= 0 and "referral_codes"."reward_percent_basis_points" is null) or ("referral_codes"."reward_kind" = 'percent' and "referral_codes"."reward_percent_basis_points" is not null and "referral_codes"."reward_percent_basis_points" between 1 and 10000 and "referral_codes"."reward_amount_cents" = 0));