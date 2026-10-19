CREATE TYPE "public"."plan_price_field" AS ENUM('monthly', 'extra_hour', 'extra_publish', 'extra_blog_posts');--> statement-breakpoint
CREATE TABLE "plan_price_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"field" "plan_price_field" NOT NULL,
	"old_amount_cents" integer NOT NULL,
	"new_amount_cents" integer NOT NULL,
	"new_plan_id" uuid,
	"changed_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_price_changes_amounts_check" CHECK ("plan_price_changes"."old_amount_cents" >= 0 and "plan_price_changes"."new_amount_cents" >= 1 and "plan_price_changes"."old_amount_cents" <> "plan_price_changes"."new_amount_cents"),
	CONSTRAINT "plan_price_changes_plan_check" CHECK (("plan_price_changes"."field" = 'monthly') = ("plan_price_changes"."new_plan_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "plan_price_changes" ADD CONSTRAINT "plan_price_changes_new_plan_id_plans_id_fk" FOREIGN KEY ("new_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_price_changes" ADD CONSTRAINT "plan_price_changes_changed_by_staff_id_users_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_price_changes_created_idx" ON "plan_price_changes" USING btree ("created_at");--> statement-breakpoint

-- Superadmins change prices from the staff console, so the staff connection may now add a plan version and retire
-- the old one, or edit a plan's extra prices. The customer's connection still only reads plans.
GRANT INSERT, UPDATE ON plans TO bb_staff;
--> statement-breakpoint

CREATE POLICY plans_staff_insert ON plans FOR INSERT TO bb_staff WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY plans_staff_update ON plans FOR UPDATE TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT ON plan_price_changes TO bb_staff;
--> statement-breakpoint

ALTER TABLE plan_price_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY plan_price_changes_staff ON plan_price_changes FOR ALL TO bb_staff USING (true) WITH CHECK (true);
