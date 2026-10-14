-- An affiliate can be paid for a limited number of each member's paid months (affiliates.reward_cycles; null is every
-- month), and every earning records which month it was (affiliate_earnings.cycle_number). The member's own discount is
-- unaffected: it runs for as long as their membership does.
ALTER TABLE "affiliate_earnings" DROP CONSTRAINT "affiliate_earnings_amounts_check";--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD COLUMN "cycle_number" integer;--> statement-breakpoint
-- Existing earnings get the month their payment was on the member's subscription: its place among that
-- subscription's applied payments (a payment that bought nothing carries an attention reason other than
-- submission_failed and is not one of the member's months).
UPDATE "affiliate_earnings" AS e
SET "cycle_number" = numbered.n
FROM (
	SELECT p."id", row_number() OVER (PARTITION BY p."subscription_id" ORDER BY p."paid_at", p."id") AS n
	FROM "payments" AS p
	WHERE p."subscription_id" IS NOT NULL
		AND p."status" = 'captured'
		AND (p."attention_reason" IS NULL OR p."attention_reason" = 'submission_failed')
) AS numbered
WHERE numbered."id" = e."payment_id";--> statement-breakpoint
UPDATE "affiliate_earnings" SET "cycle_number" = 1 WHERE "cycle_number" IS NULL;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ALTER COLUMN "cycle_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "reward_cycles" integer;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_amounts_check" CHECK ("affiliate_earnings"."amount_cents" > 0 and "affiliate_earnings"."basis_cents" >= 0 and "affiliate_earnings"."cycle_number" >= 1);--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_reward_cycles_check" CHECK ("affiliates"."reward_cycles" is null or "affiliates"."reward_cycles" between 1 and 120);