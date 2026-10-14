-- Premium's price becomes ₹9,999 a month + 18% GST in India (it was ₹6,999, 0110). Done the way 0110 and the console's Pricing
-- page do it (replaceMonthlyPrice): a NEW plan version at the new price, with the old one retired for new sign-ups, never the
-- old row edited. Everyone already subscribed stays on the plan row they pay for and keeps its price (a renewal's expected
-- amount is read from that row); new sign-ups, and a Care customer moving up to Premium, get this one. Everything else about
-- the plan (name, allowances, extras, tax, the first payment covering `initial_term_months` months) is copied from the
-- version it replaces.
--
-- The new version has no provider_plan_id: this migration cannot create a Razorpay plan. The fake provider works without one
-- (local development). In production staff press Save once on the console's Pricing page for Premium INR, which creates the
-- Razorpay plan for a plan that has none; until then the Razorpay provider refuses to open a Premium checkout.
--
-- Does nothing where Premium is already ₹9,999 (staff may have set it from the console first) or there is no Premium plan
-- on sale in rupees. Rupees only: the membership is sold in India.
--
INSERT INTO "plans" (
  "id", "code", "name", "currency", "tier", "initial_amount_cents", "initial_term_months", "recurring_amount_cents",
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", "provider_plan_id",
  "tax_rate_basis_points", "active"
)
SELECT
  gen_random_uuid(), 'premium-inr-2026-10-9999', "name", "currency", 'premium', 999900 * "initial_term_months", "initial_term_months", 999900,
  "included_publishes_per_month", "extra_publish_amount_cents", "included_change_hours", "extra_hour_amount_cents",
  "included_blog_posts", "blog_post_block_size", "extra_blog_posts_amount_cents", NULL,
  "tax_rate_basis_points", false
FROM "plans"
WHERE "currency" = 'INR' AND "tier" = 'premium' AND "active" AND "recurring_amount_cents" <> 999900
LIMIT 1;
--> statement-breakpoint

-- Retire the old version first: only one plan per currency and tier may be on sale at a time.
UPDATE "plans" SET "active" = false, "updated_at" = now()
WHERE "currency" = 'INR' AND "tier" = 'premium' AND "active" AND "code" <> 'premium-inr-2026-10-9999'
  AND EXISTS (SELECT 1 FROM "plans" WHERE "code" = 'premium-inr-2026-10-9999');
--> statement-breakpoint

UPDATE "plans" SET "active" = true, "updated_at" = now()
WHERE "code" = 'premium-inr-2026-10-9999'
  AND NOT EXISTS (SELECT 1 FROM "plans" WHERE "currency" = 'INR' AND "tier" = 'premium' AND "active");
