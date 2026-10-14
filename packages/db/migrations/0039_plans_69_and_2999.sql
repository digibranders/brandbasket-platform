-- Price change (2026-09-23): the plan is $69 a month outside India and ₹2,999 plus 18% GST in India, matching the
-- website (fynix-website a4d0a7e). Every plan still starts at its monthly price and covers one month.
--
-- Unlike 0021 and 0023, which edited the plan rows in place, this adds NEW plan rows and retires the old ones.
-- Those earlier changes were safe in place because nothing had been sold. Now subscriptions point at care-usd and
-- care-inr, and the webhook takes a renewal's expected amount from its own plan's recurring price: rewriting those
-- rows would make every existing subscriber's next renewal (which Razorpay still charges at the old price, on the old
-- Razorpay plan) look like an amount mismatch, and a mismatched renewal does not extend access. A retired plan stays
-- for the subscriptions pointing at it, which is exactly what plans.active was added for.
--
-- An unpaid checkout still on an old plan is replaced by a new one at the new price the next time the customer
-- presses Pay: decideCheckout replaces any open checkout whose plan is not the one on sale.
--
-- provider_plan_id is left null. The Razorpay plans are created by packages/billing/scripts/create-razorpay-plans.ts
-- at the taxed amounts, and their ids are written in by the migration that follows, as 0027 did for the first pair.
-- Until then the fake provider works as before and the Razorpay provider refuses to open a checkout.
UPDATE plans SET active = false, updated_at = now() WHERE code IN ('care-usd', 'care-inr') AND active;
--> statement-breakpoint

INSERT INTO plans (
  id, code, name, currency, initial_amount_cents, initial_term_months, recurring_amount_cents,
  included_publishes_per_month, extra_publish_amount_cents, included_change_hours, extra_hour_amount_cents,
  included_blog_posts, blog_post_block_size, extra_blog_posts_amount_cents, provider_plan_id, tax_rate_basis_points,
  active
)
SELECT
  gen_random_uuid(), 'care-usd-2026-09', name, currency, 6900, initial_term_months, 6900,
  included_publishes_per_month, extra_publish_amount_cents, included_change_hours, extra_hour_amount_cents,
  included_blog_posts, blog_post_block_size, extra_blog_posts_amount_cents, NULL, 0,
  true
FROM plans WHERE code = 'care-usd';
--> statement-breakpoint

INSERT INTO plans (
  id, code, name, currency, initial_amount_cents, initial_term_months, recurring_amount_cents,
  included_publishes_per_month, extra_publish_amount_cents, included_change_hours, extra_hour_amount_cents,
  included_blog_posts, blog_post_block_size, extra_blog_posts_amount_cents, provider_plan_id, tax_rate_basis_points,
  active
)
SELECT
  gen_random_uuid(), 'care-inr-2026-09', name, currency, 299900, initial_term_months, 299900,
  included_publishes_per_month, extra_publish_amount_cents, included_change_hours, extra_hour_amount_cents,
  included_blog_posts, blog_post_block_size, extra_blog_posts_amount_cents, NULL, 1800,
  true
FROM plans WHERE code = 'care-inr';
