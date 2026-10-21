-- Every service, the website included, is a line on the subscription (bundled_add_ons), priced as a package when there
-- are two or more (docs/plans/16-platform-pricing-offers.md in the BrandBasket workspace). The plan row stops being the
-- website and becomes the subscription's terms: currency, GST rate, first term and the website allowances, at a price of
-- 0, so what the provider bills is the sum of the lines. The Managed Website rows of 0180 are replaced, not retired: a
-- Brandbasket database starts with no customers, and this migration refuses to run on one that has any, because a
-- subscription and its payments point at their plan row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "subscriptions") OR EXISTS (SELECT 1 FROM "payments") THEN
    RAISE EXCEPTION 'service_packages: this database has subscriptions or payments; their Managed Website plans cannot be replaced';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "bundled_add_ons" DROP CONSTRAINT "bundled_add_ons_add_on_check";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" DROP CONSTRAINT "bundled_add_ons_amounts_check";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "pending_offer_discount_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "ad_credit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "package_offer_forfeited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_add_on_check" CHECK ("bundled_add_ons"."add_on" in ('managed-website', 'digital-growth', 'local-seo-aeo'));--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_amounts_check" CHECK ("bundled_add_ons"."list_amount_cents" > 0 and "bundled_add_ons"."offer_discount_amount_cents" >= 0
        and "bundled_add_ons"."net_amount_cents" = "bundled_add_ons"."list_amount_cents" - "bundled_add_ons"."offer_discount_amount_cents" and "bundled_add_ons"."net_amount_cents" > 0
        and "bundled_add_ons"."tax_rate_basis_points" between 0 and 10000
        and ("bundled_add_ons"."pending_offer_discount_amount_cents" is null
          or ("bundled_add_ons"."pending_offer_discount_amount_cents" >= 0 and "bundled_add_ons"."pending_offer_discount_amount_cents" < "bundled_add_ons"."list_amount_cents")));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ad_credit_check" CHECK ("subscriptions"."ad_credit_cents" >= 0);--> statement-breakpoint
DELETE FROM "plan_upgrades";
--> statement-breakpoint
DELETE FROM "plan_price_changes";
--> statement-breakpoint
DELETE FROM "provider_discount_plans";
--> statement-breakpoint
DELETE FROM "provider_bundle_plans";
--> statement-breakpoint
DELETE FROM "plans";
--> statement-breakpoint
-- Brandbasket services: the terms every subscription is opened on, priced at 0 (the services are the lines). 18% GST in
-- rupees and no tax of ours in dollars (export billing), the first payment covering one month. The allowances are 0180's
-- Managed Website ones: one included change hour, then ₹500 an hour ($10); three publishes a month, then ₹300 ($3).
INSERT INTO "plans" (
  "id", "code", "name", "currency", "tier", "initial_amount_cents", "initial_term_months", "recurring_amount_cents",
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", "provider_plan_id",
  "tax_rate_basis_points", "active"
) VALUES (
  gen_random_uuid(), 'services-inr-2026-10', 'Brandbasket services', 'INR', 'managed', 0, 1, 0,
  3, 30000, 1, 50000,
  100, 100, 47500, NULL,
  1800, true
), (
  gen_random_uuid(), 'services-usd-2026-10', 'Brandbasket services', 'USD', 'managed', 0, 1, 0,
  3, 300, 1, 1000,
  100, 100, 500, NULL,
  0, true
);
