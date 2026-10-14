-- Price change (2026-09-16): the USD plan is $75 (7500) a month from the first payment, rather than $225 (22500)
-- for the first three months. Every plan now starts at its monthly price and covers one month, like the INR plan
-- (0012_inr_one_month_plan.sql). 0009_billing.sql, which seeded the old USD price, had already run on every
-- database, so the change is applied here rather than by editing it. No USD subscription had been sold.
-- Subscriptions already recorded keep their own amounts; only new first payments use the new price.
UPDATE plans SET initial_amount_cents = 7500, initial_term_months = 1, updated_at = now() WHERE code = 'care-usd';
