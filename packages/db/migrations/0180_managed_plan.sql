-- Brandbasket sells one plan, Managed Website (tier `managed`), with Digital Growth and Local SEO + AEO as add-ons billed
-- inside its subscription (docs/plans/11-platform-plans.md in the BrandBasket workspace). The Care and Premium rows this
-- repository inherited from Fynix are replaced, not retired: a Brandbasket database starts with no customers, and this
-- migration refuses to run on one that has any, because a subscription and its payments point at their plan row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "subscriptions") OR EXISTS (SELECT 1 FROM "payments") THEN
    RAISE EXCEPTION 'managed_plan: this database has subscriptions or payments; their Care or Premium plans cannot be replaced';
  END IF;
END $$;
--> statement-breakpoint
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
ALTER TABLE "plans" ALTER COLUMN "tier" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "tier" SET DATA TYPE text;
--> statement-breakpoint
DROP TYPE "public"."plan_tier";
--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('managed');
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "tier" SET DATA TYPE "public"."plan_tier" USING "tier"::"public"."plan_tier";
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "tier" SET DEFAULT 'managed';
--> statement-breakpoint
-- A business that chose Care or Premium at sign-up (only test accounts, given the guard above) now chose Managed Website.
ALTER TABLE "businesses" ALTER COLUMN "signup_choice" SET DATA TYPE text;
--> statement-breakpoint
UPDATE "businesses" SET "signup_choice" = 'managed' WHERE "signup_choice" IN ('care', 'premium');
--> statement-breakpoint
DROP TYPE "public"."signup_choice";
--> statement-breakpoint
CREATE TYPE "public"."signup_choice" AS ENUM('own_website', 'listing_only', 'managed');
--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "signup_choice" SET DATA TYPE "public"."signup_choice" USING "signup_choice"::"public"."signup_choice";
--> statement-breakpoint
-- Managed Website in rupees: ₹3,000 a month before 18% GST, the first payment covering one month. Two small edits a month
-- of up to 30 minutes each are one included change hour; extra time is ₹500 an hour. Publishes and blog allowances are
-- the ones the platform already sold. No dollar row until the owner sets the dollar prices.
INSERT INTO "plans" (
  "id", "code", "name", "currency", "tier", "initial_amount_cents", "initial_term_months", "recurring_amount_cents",
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", "provider_plan_id",
  "tax_rate_basis_points", "active"
) VALUES (
  gen_random_uuid(), 'managed-inr-2026-10', 'Managed Website', 'INR', 'managed', 300000, 1, 300000,
  3, 30000, 1, 50000,
  100, 100, 47500, NULL,
  1800, true
);
