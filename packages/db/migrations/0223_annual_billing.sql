CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
DROP INDEX "provider_bundle_plans_plan_net_idx";--> statement-breakpoint
ALTER TABLE "provider_bundle_plans" ADD COLUMN "billing_interval" "billing_interval" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" "billing_interval" DEFAULT 'month' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_bundle_plans_plan_net_idx" ON "provider_bundle_plans" USING btree ("plan_id","net_monthly_cents","provider","billing_interval");