-- Dollar prices for customers outside India, matching the website's US page (brandbasket.in/us/free-business-website): the
-- Care plan is $75 a month and changes are $10 an hour, with no tax of ours. India's plan and prices are not touched.
--
-- Add-ons can now be sold in dollars too ($100, $125 and $125 a month, priced in packages/shared/src/lib/billing/add-ons.ts),
-- so the check that kept add-on subscriptions in rupees goes. The billing_currency enum still limits it to USD and INR.
-- drizzle-kit's DDL, unchanged.
ALTER TABLE "add_on_subscriptions" DROP CONSTRAINT "add_on_subscriptions_currency_check";--> statement-breakpoint

-- The Care plan in dollars, put on sale beside the rupee one (one active plan per currency and tier). The dollar plans that
-- came before ($75 care-usd, $69 care-usd-2026-09) are Premium rows and stay retired. Allowances and the blog-post and
-- publish extras are the dollar plan's existing ones; the first payment covers one month, as for every plan.
--
-- provider_plan_id is null: this migration cannot create a Razorpay plan. The fake provider works without one. In production
-- staff press Save once on the console's Pricing page for Care USD, which creates the Razorpay plan; until then the Razorpay
-- provider refuses to open a dollar checkout. Does nothing where a Care plan is already on sale in dollars.
INSERT INTO "plans" (
  "id", "code", "name", "currency", "tier", "initial_amount_cents", "initial_term_months", "recurring_amount_cents",
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", "provider_plan_id",
  "tax_rate_basis_points", "active"
)
SELECT
  gen_random_uuid(), 'care-usd-2026-10', 'Care', 'USD', 'care', 7500, 1, 7500,
  3, 300, 1, 1000,
  100, 100, 500, NULL,
  0, true
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "currency" = 'USD' AND "tier" = 'care' AND "active");
