CREATE TYPE "public"."charge_kind" AS ENUM('change_hours', 'blog_posts', 'extra_publish', 'custom');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('open', 'paid', 'waived');--> statement-breakpoint
ALTER TYPE "public"."payment_kind" ADD VALUE 'charge';--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" charge_kind NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount_cents" integer NOT NULL,
	"tax_rate_basis_points" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"status" charge_status DEFAULT 'open' NOT NULL,
	"created_by_staff_id" text,
	"provider" "billing_provider",
	"provider_order_id" text,
	"payment_id" uuid,
	"paid_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waived_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_description_check" CHECK (char_length("charges"."description") between 1 and 200 and "charges"."description" = btrim("charges"."description")),
	CONSTRAINT "charges_amounts_check" CHECK ("charges"."quantity" >= 1 and "charges"."unit_amount_cents" >= 1 and "charges"."tax_rate_basis_points" >= 0 and "charges"."amount_cents" >= "charges"."unit_amount_cents" * "charges"."quantity"),
	CONSTRAINT "charges_provider_order_check" CHECK (("charges"."provider" is null) = ("charges"."provider_order_id" is null)),
	CONSTRAINT "charges_status_check" CHECK (case "charges"."status"
        when 'open' then "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is null
        when 'paid' then "charges"."payment_id" is not null and "charges"."paid_at" is not null and "charges"."waived_at" is null
        else "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is not null and "charges"."waived_by_staff_id" is not null
      end)
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_waived_by_staff_id_users_id_fk" FOREIGN KEY ("waived_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_business_id_idx" ON "charges" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_payment_id_idx" ON "charges" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_provider_order_idx" ON "charges" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_one_open_blog_unlock_idx" ON "charges" USING btree ("business_id") WHERE "charges"."kind" = 'blog_posts' and "charges"."status" = 'open';--> statement-breakpoint

-- The customer reads its own charges (the Billing page's "To pay" list and the blog allowance) and never writes
-- them through the app connection: every write goes through a server path that checks access first and then uses
-- the staff connection, the same way payments are recorded.
GRANT SELECT ON charges TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON charges TO fynix_staff;
--> statement-breakpoint

ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY charges_tenant_select ON charges FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY charges_staff_all ON charges FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
