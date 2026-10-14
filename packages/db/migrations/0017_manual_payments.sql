-- Payments the team receives outside any provider (a bank transfer) are recorded by an admin in the staff console
-- and tagged `manual`, so they are never mistaken for a test payment or a Razorpay one. Nothing in this migration
-- uses the new value, which Postgres requires when the value is added inside the migration transaction.
ALTER TYPE "public"."billing_provider" ADD VALUE 'manual';
