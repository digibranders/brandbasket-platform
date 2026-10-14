-- The Razorpay Plan created for each currency by packages/billing/scripts/create-razorpay-plans.ts (test mode).
-- Re-run that script and this migration (with new values) when switching to live-mode keys.
UPDATE plans SET provider_plan_id = 'plan_TdOjd3zaBn1QTR' WHERE code = 'care-usd';
--> statement-breakpoint
UPDATE plans SET provider_plan_id = 'plan_TdOjdDiZYlAwxL' WHERE code = 'care-inr';
