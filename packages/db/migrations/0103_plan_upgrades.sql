CREATE TYPE "public"."plan_upgrade_source" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."plan_upgrade_status" AS ENUM('open', 'paid', 'scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "plan_upgrades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_plan_id" uuid NOT NULL,
	"to_plan_id" uuid NOT NULL,
	"from_discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"to_discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"net_difference_cents" integer NOT NULL,
	"charge_cents" integer NOT NULL,
	"source" "plan_upgrade_source" NOT NULL,
	"created_by_staff_id" text,
	"charge_id" uuid,
	"status" "plan_upgrade_status" DEFAULT 'open' NOT NULL,
	"provider_plan_id" text,
	"paid_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_upgrades_amounts_check" CHECK ("plan_upgrades"."from_discount_amount_cents" >= 0 and "plan_upgrades"."to_discount_amount_cents" >= 0 and "plan_upgrades"."net_difference_cents" >= 0 and "plan_upgrades"."charge_cents" >= 0 and ("plan_upgrades"."charge_id" is not null) = ("plan_upgrades"."charge_cents" > 0)),
	CONSTRAINT "plan_upgrades_staff_check" CHECK (("plan_upgrades"."source" = 'staff') = ("plan_upgrades"."created_by_staff_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "charges" DROP CONSTRAINT "charges_status_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_from_plan_id_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_to_plan_id_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upgrades" ADD CONSTRAINT "plan_upgrades_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_upgrades_charge_id_idx" ON "plan_upgrades" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "plan_upgrades_business_id_idx" ON "plan_upgrades" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_upgrades_subscription_id_idx" ON "plan_upgrades" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_upgrades_one_in_flight_idx" ON "plan_upgrades" USING btree ("business_id") WHERE "plan_upgrades"."status" in ('open', 'paid', 'scheduled');--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_one_open_plan_upgrade_idx" ON "charges" USING btree ("business_id") WHERE "charges"."kind" = 'plan_upgrade' and "charges"."status" = 'open';--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_status_check" CHECK (case "charges"."status"
        when 'open' then "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is null
        when 'paid' then "charges"."payment_id" is not null and "charges"."paid_at" is not null and "charges"."waived_at" is null
        else "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is not null and ("charges"."waived_by_staff_id" is not null or "charges"."kind" in ('directory_ad', 'plan_upgrade'))
      end);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_check" CHECK ("subscriptions"."pending_discount_amount_cents" >= 0 and ("subscriptions"."pending_discount_amount_cents" = 0 or ("subscriptions"."pending_plan_id" is not null and "subscriptions"."referral_code_id" is not null)));