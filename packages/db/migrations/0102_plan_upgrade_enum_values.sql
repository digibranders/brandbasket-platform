-- New enum labels are added in a migration of their own: Postgres will not use a label added in the same
-- transaction, and the next migration's index and check refer to them.
ALTER TYPE "public"."charge_kind" ADD VALUE 'plan_upgrade';--> statement-breakpoint
ALTER TYPE "public"."payment_attention_reason" ADD VALUE 'upgrade_not_applied';--> statement-breakpoint
ALTER TYPE "public"."payment_attention_reason" ADD VALUE 'upgrade_provider_pending';
