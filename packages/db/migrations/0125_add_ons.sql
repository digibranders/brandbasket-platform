CREATE TYPE "public"."add_on_subscription_status" AS ENUM('incomplete', 'scheduled', 'active', 'past_due', 'halted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."press_release_status" AS ENUM('waiting', 'in_progress', 'published');--> statement-breakpoint
CREATE TABLE "add_on_payments" (
	"payment_id" uuid PRIMARY KEY NOT NULL,
	"add_on_subscription_id" uuid NOT NULL,
	"business_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "add_on_provider_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"add_on" text NOT NULL,
	"net_amount_cents" integer NOT NULL,
	"tax_rate_basis_points" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "add_on_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"add_on" text NOT NULL,
	"list_amount_cents" integer NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"net_amount_cents" integer NOT NULL,
	"tax_rate_basis_points" integer NOT NULL,
	"charged_amount_cents" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_plan_id" text,
	"provider_status" text,
	"status" "add_on_subscription_status" DEFAULT 'incomplete' NOT NULL,
	"start_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"halted_at" timestamp with time zone,
	"end_kind" text,
	"end_requested_at" timestamp with time zone,
	"end_requested_by_staff_id" text,
	"ended_at" timestamp with time zone,
	"continues_id" uuid,
	"contacted_at" timestamp with time zone,
	"contacted_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "add_on_subscriptions_add_on_check" CHECK ("add_on_subscriptions"."add_on" in ('local-seo', 'performance-marketing')),
	CONSTRAINT "add_on_subscriptions_currency_check" CHECK ("add_on_subscriptions"."currency" = 'INR'),
	CONSTRAINT "add_on_subscriptions_amounts_check" CHECK ("add_on_subscriptions"."list_amount_cents" > 0 and "add_on_subscriptions"."discount_amount_cents" >= 0
        and "add_on_subscriptions"."net_amount_cents" = "add_on_subscriptions"."list_amount_cents" - "add_on_subscriptions"."discount_amount_cents" and "add_on_subscriptions"."net_amount_cents" > 0
        and "add_on_subscriptions"."tax_rate_basis_points" between 0 and 10000 and "add_on_subscriptions"."charged_amount_cents" >= "add_on_subscriptions"."net_amount_cents"),
	CONSTRAINT "add_on_subscriptions_end_check" CHECK (("add_on_subscriptions"."end_kind" is null) = ("add_on_subscriptions"."end_requested_at" is null) and ("add_on_subscriptions"."end_kind" is null or "add_on_subscriptions"."end_kind" in ('cancel', 'pause')))
);
--> statement-breakpoint
CREATE TABLE "press_releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"status" "press_release_status" DEFAULT 'waiting' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "add_on_payments" ADD CONSTRAINT "add_on_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_payments" ADD CONSTRAINT "add_on_payments_add_on_subscription_id_add_on_subscriptions_id_fk" FOREIGN KEY ("add_on_subscription_id") REFERENCES "public"."add_on_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_payments" ADD CONSTRAINT "add_on_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_end_requested_by_staff_id_users_id_fk" FOREIGN KEY ("end_requested_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_contacted_by_staff_id_users_id_fk" FOREIGN KEY ("contacted_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_continues_id_fk" FOREIGN KEY ("continues_id") REFERENCES "public"."add_on_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_releases" ADD CONSTRAINT "press_releases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_releases" ADD CONSTRAINT "press_releases_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_releases" ADD CONSTRAINT "press_releases_status_changed_by_staff_id_users_id_fk" FOREIGN KEY ("status_changed_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "add_on_payments_subscription_idx" ON "add_on_payments" USING btree ("add_on_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_provider_plans_key_idx" ON "add_on_provider_plans" USING btree ("add_on","net_amount_cents","tax_rate_basis_points","currency","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_subscriptions_provider_idx" ON "add_on_subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_subscriptions_one_billing_idx" ON "add_on_subscriptions" USING btree ("business_id","add_on") WHERE "add_on_subscriptions"."status" in ('scheduled', 'active', 'past_due', 'halted') and "add_on_subscriptions"."end_kind" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "add_on_subscriptions_one_checkout_idx" ON "add_on_subscriptions" USING btree ("business_id","add_on") WHERE "add_on_subscriptions"."status" = 'incomplete';--> statement-breakpoint
CREATE INDEX "add_on_subscriptions_business_idx" ON "add_on_subscriptions" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "press_releases_charge_idx" ON "press_releases" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "press_releases_business_idx" ON "press_releases" USING btree ("business_id","created_at");