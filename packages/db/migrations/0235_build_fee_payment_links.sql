CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"lead_id" uuid,
	"business_id" uuid,
	"contact_name" text,
	"business_name" text,
	"email" text,
	"phone_country" text,
	"phone" text,
	"country_code" text NOT NULL,
	"state_code" text,
	"gstin" text,
	"legal_name" text,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"city" text,
	"currency" "billing_currency" NOT NULL,
	"services" text[] NOT NULL,
	"billing_interval" text NOT NULL,
	"website_kind" text,
	"setup_fee_list_cents" integer,
	"setup_fee_discount_cents" integer,
	"setup_fee_note" text,
	"referral_code_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" text,
	"paid_at" timestamp with time zone,
	"subscription_id" uuid,
	"created_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "payment_links_interval_check" CHECK ("payment_links"."billing_interval" in ('month', 'year')),
	CONSTRAINT "payment_links_services_check" CHECK (cardinality("payment_links"."services") between 1 and 4),
	CONSTRAINT "payment_links_country_check" CHECK ("payment_links"."country_code" ~ '^[A-Z]{2}$' and ("payment_links"."currency" = 'INR') = ("payment_links"."country_code" = 'IN')),
	CONSTRAINT "payment_links_fee_check" CHECK (("payment_links"."website_kind" is null and "payment_links"."setup_fee_list_cents" is null and "payment_links"."setup_fee_discount_cents" is null and "payment_links"."setup_fee_note" is null)
        or ("payment_links"."website_kind" is not null and "payment_links"."website_kind" in ('b2b', 'ecommerce') and 'managed-website' = any("payment_links"."services")
          and "payment_links"."setup_fee_list_cents" > 0 and "payment_links"."setup_fee_discount_cents" between 0 and "payment_links"."setup_fee_list_cents"
          and ("payment_links"."setup_fee_note" is null or char_length("payment_links"."setup_fee_note") between 1 and 200))),
	CONSTRAINT "payment_links_paid_check" CHECK (("payment_links"."paid_at" is null) = ("payment_links"."subscription_id" is null) and ("payment_links"."paid_at" is null or "payment_links"."business_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_first_payment_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "website_kind" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "setup_fee_list_cents" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "setup_fee_discount_cents" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "setup_fee_note" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_link_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "website_kind" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_revoked_by_staff_id_users_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_links_business_idx" ON "payment_links" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "payment_links_lead_idx" ON "payment_links" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "payment_links_created_idx" ON "payment_links" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_website_kind_check" CHECK ("subscriptions"."website_kind" is null or "subscriptions"."website_kind" in ('b2b', 'ecommerce'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_setup_fee_check" CHECK (("subscriptions"."setup_fee_list_cents" is null and "subscriptions"."setup_fee_discount_cents" is null and "subscriptions"."setup_fee_note" is null)
        or ("subscriptions"."website_kind" is not null and "subscriptions"."website_kind" in ('b2b', 'ecommerce') and "subscriptions"."setup_fee_list_cents" > 0
          and "subscriptions"."setup_fee_discount_cents" between 0 and "subscriptions"."setup_fee_list_cents"
          and ("subscriptions"."setup_fee_note" is null or char_length("subscriptions"."setup_fee_note") between 1 and 200)));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_first_payment_check" CHECK (("subscriptions"."first_payment_cents" is null) = ("subscriptions"."first_charge_at" is null) and ("subscriptions"."first_payment_cents" is null or "subscriptions"."first_payment_cents" > 0));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_website_kind_check" CHECK ("projects"."website_kind" is null or "projects"."website_kind" in ('b2b', 'ecommerce'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_links" TO bb_staff;
--> statement-breakpoint
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_links_staff_all ON "payment_links" FOR ALL TO bb_staff USING (true) WITH CHECK (true);
