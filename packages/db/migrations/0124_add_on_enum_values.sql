-- New values for add-ons (docs/superpowers/specs/2026-10-09-add-ons-design.md). In a migration of their own: Postgres
-- refuses to use an enum value in the transaction that added it, and the next migration uses both.
ALTER TYPE "public"."payment_kind" ADD VALUE 'add_on';--> statement-breakpoint
ALTER TYPE "public"."charge_kind" ADD VALUE 'press_release';
