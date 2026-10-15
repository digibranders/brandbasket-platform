-- The 5% first-checkout offer is on the add-ons only (add_on_subscriptions.offer_discount_amount_cents, 0166); the plan is never
-- discounted by it, so the column 0166 added to subscriptions is dropped and its discount check is the one it was.
-- drizzle-kit's DDL, unchanged.
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_discount_check";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "offer_discount_cents";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_check" CHECK ("subscriptions"."discount_amount_cents" >= 0 and "subscriptions"."retention_discount_cents" >= 0 and "subscriptions"."retention_discount_cents" <= "subscriptions"."discount_amount_cents" and ("subscriptions"."referral_code_id" is not null or "subscriptions"."discount_amount_cents" = "subscriptions"."retention_discount_cents"));