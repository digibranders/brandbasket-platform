CREATE TYPE "public"."bundled_add_on_status" AS ENUM('pending', 'active', 'removed');--> statement-breakpoint
CREATE TABLE "bundled_add_ons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"add_on" text NOT NULL,
	"list_amount_cents" integer NOT NULL,
	"offer_discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"net_amount_cents" integer NOT NULL,
	"tax_rate_basis_points" integer NOT NULL,
	"status" "bundled_add_on_status" DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundled_add_ons_add_on_check" CHECK ("bundled_add_ons"."add_on" in ('social-media', 'lead-generation', 'advertising')),
	CONSTRAINT "bundled_add_ons_amounts_check" CHECK ("bundled_add_ons"."list_amount_cents" > 0 and "bundled_add_ons"."offer_discount_amount_cents" >= 0
        and "bundled_add_ons"."net_amount_cents" = "bundled_add_ons"."list_amount_cents" - "bundled_add_ons"."offer_discount_amount_cents" and "bundled_add_ons"."net_amount_cents" > 0
        and "bundled_add_ons"."tax_rate_basis_points" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "provider_bundle_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"net_monthly_cents" integer NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_bundle_plans_net_check" CHECK ("provider_bundle_plans"."net_monthly_cents" > 0),
	CONSTRAINT "provider_bundle_plans_provider_plan_check" CHECK ("provider_bundle_plans"."provider_plan_id" <> '')
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "bundled_add_on_net_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_bundle_plans" ADD CONSTRAINT "provider_bundle_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundled_add_ons_subscription_add_on_idx" ON "bundled_add_ons" USING btree ("subscription_id","add_on");--> statement-breakpoint
CREATE INDEX "bundled_add_ons_business_idx" ON "bundled_add_ons" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_bundle_plans_plan_net_idx" ON "provider_bundle_plans" USING btree ("plan_id","net_monthly_cents","provider");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_bundled_check" CHECK ("subscriptions"."bundled_add_on_net_cents" >= 0);--> statement-breakpoint

-- Grants and row-level security, as for add_on_subscriptions (0126): customers read their own bundled add-ons, every write
-- goes through a server path on the staff connection, and nobody deletes. The Razorpay plan table is staff only.
GRANT SELECT ON bundled_add_ons TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON bundled_add_ons, provider_bundle_plans TO fynix_staff;
--> statement-breakpoint

ALTER TABLE bundled_add_ons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE provider_bundle_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY bundled_add_ons_tenant_select ON bundled_add_ons FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY bundled_add_ons_staff_all ON bundled_add_ons FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY provider_bundle_plans_staff_all ON provider_bundle_plans FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
