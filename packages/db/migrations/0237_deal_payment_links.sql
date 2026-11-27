CREATE TABLE "business_price_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"add_on" text NOT NULL,
	"billing_interval" text NOT NULL,
	"net_cents" integer NOT NULL,
	"payment_link_id" uuid,
	"set_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_price_overrides_unique" UNIQUE("business_id","add_on","billing_interval"),
	CONSTRAINT "business_price_overrides_add_on_check" CHECK ("business_price_overrides"."add_on" in ('managed-website', 'social-media', 'paid-ads', 'expert-monitoring')),
	CONSTRAINT "business_price_overrides_interval_check" CHECK ("business_price_overrides"."billing_interval" in ('month', 'year')),
	CONSTRAINT "business_price_overrides_price_check" CHECK ("business_price_overrides"."net_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_setup_fee_check";--> statement-breakpoint
ALTER TABLE "payment_links" DROP CONSTRAINT "payment_links_fee_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "setup_fee_advance_cents" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "deal_type" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "advance_cents" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "advance_charge_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "advance_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "ready_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "website_price_cents" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "social_price_cents" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "ads_price_cents" integer;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "monitoring_price_cents" integer;--> statement-breakpoint
-- Plan 66 backfill. A fee with something left to pay is a paid deal whose advance is the whole net fee (how plan 65 links charged it);
-- a fully waived fee is a free deal, and a link whose basket holds the website gets the default kind (B2B), as an unset kind always meant.
UPDATE "payment_links" SET "website_kind" = 'b2b' WHERE "website_kind" IS NULL AND 'managed-website' = ANY("services");--> statement-breakpoint
UPDATE "payment_links" SET "deal_type" = 'paid', "advance_cents" = "setup_fee_list_cents" - "setup_fee_discount_cents" WHERE "setup_fee_list_cents" IS NOT NULL AND "setup_fee_list_cents" - "setup_fee_discount_cents" > 0;--> statement-breakpoint
UPDATE "payment_links" SET "deal_type" = 'free', "setup_fee_list_cents" = NULL, "setup_fee_discount_cents" = NULL, "setup_fee_note" = NULL WHERE "deal_type" IS NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ALTER COLUMN "deal_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "business_price_overrides" ADD CONSTRAINT "business_price_overrides_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_price_overrides" ADD CONSTRAINT "business_price_overrides_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_price_overrides" ADD CONSTRAINT "business_price_overrides_set_by_staff_id_users_id_fk" FOREIGN KEY ("set_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_advance_charge_id_charges_id_fk" FOREIGN KEY ("advance_charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_ready_by_staff_id_users_id_fk" FOREIGN KEY ("ready_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_setup_fee_advance_check" CHECK ("subscriptions"."setup_fee_advance_cents" is null or ("subscriptions"."setup_fee_list_cents" is not null and "subscriptions"."setup_fee_advance_cents" >= 0));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_setup_fee_check" CHECK (("subscriptions"."setup_fee_list_cents" is null and "subscriptions"."setup_fee_discount_cents" is null and "subscriptions"."setup_fee_note" is null)
        or ("subscriptions"."website_kind" is not null and "subscriptions"."website_kind" in ('b2b', 'ecommerce') and "subscriptions"."setup_fee_list_cents" > 0
          and "subscriptions"."setup_fee_discount_cents" between 0 and "subscriptions"."setup_fee_list_cents"
          and ("subscriptions"."setup_fee_note" is null or char_length("subscriptions"."setup_fee_note") between 1 and 200)
          and ("subscriptions"."setup_fee_advance_cents" is null or "subscriptions"."setup_fee_advance_cents" between 0 and ("subscriptions"."setup_fee_list_cents" - "subscriptions"."setup_fee_discount_cents"))));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_deal_type_check" CHECK ("payment_links"."deal_type" in ('free', 'paid'));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_website_kind_check" CHECK (("payment_links"."website_kind" is not null and "payment_links"."website_kind" in ('b2b', 'ecommerce') and 'managed-website' = any("payment_links"."services"))
        or ("payment_links"."website_kind" is null and not ('managed-website' = any("payment_links"."services"))));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_custom_price_check" CHECK (("payment_links"."website_price_cents" is null or ("payment_links"."website_price_cents" > 0 and 'managed-website' = any("payment_links"."services")))
        and ("payment_links"."social_price_cents" is null or ("payment_links"."social_price_cents" > 0 and 'social-media' = any("payment_links"."services")))
        and ("payment_links"."ads_price_cents" is null or ("payment_links"."ads_price_cents" > 0 and 'paid-ads' = any("payment_links"."services")))
        and ("payment_links"."monitoring_price_cents" is null or ("payment_links"."monitoring_price_cents" > 0 and 'expert-monitoring' = any("payment_links"."services"))));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_coupon_or_price_check" CHECK ("payment_links"."referral_code_id" is null
        or ("payment_links"."website_price_cents" is null and "payment_links"."social_price_cents" is null and "payment_links"."ads_price_cents" is null and "payment_links"."monitoring_price_cents" is null));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_advance_check" CHECK (("payment_links"."advance_paid_at" is null or ("payment_links"."advance_charge_id" is not null and "payment_links"."business_id" is not null))
        and ("payment_links"."ready_at" is null or "payment_links"."advance_paid_at" is not null)
        and (("payment_links"."ready_at" is null) = ("payment_links"."ready_by_staff_id" is null)));--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_fee_check" CHECK (("payment_links"."deal_type" = 'free' and "payment_links"."setup_fee_list_cents" is null and "payment_links"."setup_fee_discount_cents" is null and "payment_links"."setup_fee_note" is null and "payment_links"."advance_cents" is null)
        or ("payment_links"."deal_type" = 'paid' and 'managed-website' = any("payment_links"."services")
          and "payment_links"."setup_fee_list_cents" is not null and "payment_links"."setup_fee_list_cents" > 0
          and "payment_links"."setup_fee_discount_cents" is not null and "payment_links"."setup_fee_discount_cents" between 0 and "payment_links"."setup_fee_list_cents"
          and "payment_links"."advance_cents" is not null and "payment_links"."advance_cents" between 1 and ("payment_links"."setup_fee_list_cents" - "payment_links"."setup_fee_discount_cents")
          and ("payment_links"."setup_fee_note" is null or char_length("payment_links"."setup_fee_note") between 1 and 200)));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "business_price_overrides" TO bb_staff;
--> statement-breakpoint
ALTER TABLE "business_price_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY business_price_overrides_staff_all ON "business_price_overrides" FOR ALL TO bb_staff USING (true) WITH CHECK (true);
