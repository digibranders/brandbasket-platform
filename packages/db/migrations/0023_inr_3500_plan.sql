-- Price change (2026-09-17): the INR plan is ₹3,500 (350000 paise) a month, from the first payment, rather than
-- ₹2,500 (250000). 0012_inr_one_month_plan.sql, which set the old price, had already run on every database, so the
-- change is applied here rather than by editing it. No INR subscription had been sold. Subscriptions already
-- recorded keep their own amounts; only new payments use the new price.
UPDATE plans
SET initial_amount_cents = 350000, recurring_amount_cents = 350000, updated_at = now()
WHERE code = 'care-inr';
