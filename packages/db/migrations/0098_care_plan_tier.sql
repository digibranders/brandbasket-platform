-- Fynix: plans are seeded as "Care" and "Premium" (they were "Firstfold Care" and "Firstfold Premium" in Firstfold's database). Databases
-- that already ran this migration keep the old names, which brandedPlanName (apps/platform/lib/brand.ts) hides from customers.
CREATE TYPE "public"."plan_tier" AS ENUM('care', 'premium');--> statement-breakpoint
ALTER TYPE "public"."signup_choice" ADD VALUE 'care';--> statement-breakpoint
DROP INDEX "plans_currency_active_idx";--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "tier" "plan_tier" DEFAULT 'premium' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_currency_tier_active_idx" ON "plans" USING btree ("currency","tier") WHERE "plans"."active";--> statement-breakpoint

--
-- The Care plan (docs/superpowers/specs/2026-10-07-care-plan-design.md): the website only, with its management, the
-- chatbot, and the server and hosting. Every plan that existed before is Premium's, which is what the column defaults
-- to, so they are renamed here rather than left called "Firstfold care plan", which is what customers read on their
-- billing page. Their codes keep the `care-` prefix they were sold under: a code is never rewritten.
--
-- Care starts at ₹2,999 a month + 18% GST in India, the price the website plan was sold at before Premium. Staff set
-- the real price in the console's Pricing page, which also creates the Razorpay plan; until then provider_plan_id is
-- null, so the fake provider works and the Razorpay provider refuses to open a Care checkout. Rupees only: the
-- membership is sold in India. A currency with no Care plan on sale is answered as any currency with no plan is.
UPDATE "plans" SET "name" = 'Premium', "updated_at" = now() WHERE "tier" = 'premium';
--> statement-breakpoint

INSERT INTO "plans" (
  "id", "code", "name", "currency", "tier", "initial_amount_cents", "initial_term_months", "recurring_amount_cents",
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", "provider_plan_id",
  "tax_rate_basis_points", "active"
)
SELECT
  gen_random_uuid(), 'care-inr-2026-10', 'Care', "currency", 'care', 299900, "initial_term_months", 299900,
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", NULL,
  1800, true
FROM "plans" WHERE "currency" = 'INR' AND "tier" = 'premium' AND "active"
LIMIT 1;
