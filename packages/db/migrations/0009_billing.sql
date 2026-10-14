CREATE TYPE "public"."billing_provider" AS ENUM('fake', 'razorpay');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('initial', 'renewal', 'reactivation', 'extra_publish');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'active', 'past_due', 'inactive', 'cancelled');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"subscription_id" uuid,
	"provider" "billing_provider" NOT NULL,
	"provider_payment_id" text NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"status" "payment_status" NOT NULL,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"initial_amount_cents" integer NOT NULL,
	"initial_term_months" integer NOT NULL,
	"recurring_amount_cents" integer NOT NULL,
	"included_publishes_per_month" integer NOT NULL,
	"extra_publish_amount_cents" integer NOT NULL,
	"provider_plan_id" text,
	"active" text DEFAULT 'yes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_status" text,
	"status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
	"activated_at" timestamp with time zone,
	"commitment_ends_at" timestamp with time zone,
	"paid_through_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_id_idx" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_business_id_idx" ON "payments" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_currency_active_idx" ON "plans" USING btree ("currency") WHERE "plans"."active" = 'yes';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_id_idx" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_business_idx" ON "subscriptions" USING btree ("business_id") WHERE "subscriptions"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "subscriptions_business_id_idx" ON "subscriptions" USING btree ("business_id");--> statement-breakpoint
-- The live plans. Prices are decided in docs/superpowers/specs/2026-09-15-platform-design.md §1.
-- Amounts are integer minor units: US cents for USD, paise for INR. $225 = 22500, $75 = 7500,
-- ₹7,500 = 750000 and ₹2,500 = 250000. The initial amount is the first three months of the
-- subscription paid up front, not a build fee.
INSERT INTO plans (id, code, name, currency, initial_amount_cents, initial_term_months,
                   recurring_amount_cents, included_publishes_per_month, extra_publish_amount_cents)
VALUES
  (gen_random_uuid(), 'care-usd', 'Premium', 'USD', 22500, 3, 7500, 3, 300),
  (gen_random_uuid(), 'care-inr', 'Premium', 'INR', 750000, 3, 250000, 3, 30000)
ON CONFLICT (code) DO NOTHING;
