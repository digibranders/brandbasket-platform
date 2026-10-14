-- Price change (2026-09-16): the INR plan's first payment is ₹2,500 covering one month, the same as every month
-- after it, rather than ₹7,500 for three. Amounts are paise: ₹2,500 = 250000. USD is unchanged: $225 (22500)
-- for the first three months, then $75 (7500) a month.
-- 0009_billing.sql, which seeded the old INR price, had already run on every database, so the change is applied
-- here rather than by editing it. No INR subscription had been sold at the old price.
UPDATE plans SET initial_amount_cents = 250000, initial_term_months = 1, updated_at = now() WHERE code = 'care-inr';
