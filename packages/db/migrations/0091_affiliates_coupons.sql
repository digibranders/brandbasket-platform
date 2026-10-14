-- Affiliates and coupons (docs/superpowers/specs/2026-10-06-affiliates-coupons-design.md).
--
-- A referral code is now either a coupon (affiliate_id null: a discount, nobody is paid) or an affiliate code (it
-- names the affiliate we pay for every month the member pays, and may discount nothing at all: discount_kind null).
-- Earnings are written per payment into affiliate_earnings and settled by affiliate_payouts. Discounts reach
-- Razorpay through discounted Razorpay plans, remembered in provider_discount_plans, instead of hand-made Offers.
--
-- Every existing code had a referrer, so each becomes an affiliate code: one affiliate per referrer email (case
-- folded), named and rewarded as the earliest of their codes. The retired columns are dropped in 0092.
CREATE TYPE "public"."affiliate_earning_status" AS ENUM('owed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "affiliate_earnings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"basis_cents" integer NOT NULL,
	"status" "affiliate_earning_status" DEFAULT 'owed' NOT NULL,
	"payout_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_earnings_amounts_check" CHECK ("affiliate_earnings"."amount_cents" > 0 and "affiliate_earnings"."basis_cents" >= 0),
	CONSTRAINT "affiliate_earnings_status_check" CHECK (case "affiliate_earnings"."status"
        when 'owed' then "affiliate_earnings"."payout_id" is null and "affiliate_earnings"."cancelled_at" is null and "affiliate_earnings"."cancelled_by_staff_id" is null
        when 'paid' then "affiliate_earnings"."payout_id" is not null and "affiliate_earnings"."cancelled_at" is null and "affiliate_earnings"."cancelled_by_staff_id" is null
        else "affiliate_earnings"."payout_id" is null and "affiliate_earnings"."cancelled_at" is not null and "affiliate_earnings"."cancelled_by_staff_id" is not null
      end)
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text NOT NULL,
	"recorded_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_payouts_amount_check" CHECK ("affiliate_payouts"."amount_cents" > 0),
	CONSTRAINT "affiliate_payouts_reference_check" CHECK (char_length("affiliate_payouts"."reference") between 1 and 100 and "affiliate_payouts"."reference" = btrim("affiliate_payouts"."reference"))
);
--> statement-breakpoint
CREATE TABLE "provider_discount_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"discount_amount_cents" integer NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"provider_plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_discount_plans_discount_check" CHECK ("provider_discount_plans"."discount_amount_cents" > 0),
	CONSTRAINT "provider_discount_plans_provider_plan_check" CHECK ("provider_discount_plans"."provider_plan_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"reward_kind" "referral_value_kind" NOT NULL,
	"reward_amount_cents" integer,
	"reward_currency" "billing_currency",
	"reward_percent_basis_points" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_name_check" CHECK (char_length(btrim("affiliates"."name")) between 1 and 120),
	CONSTRAINT "affiliates_contact_check" CHECK (("affiliates"."email" is not null or "affiliates"."phone" is not null) and ("affiliates"."email" is null or char_length("affiliates"."email") between 3 and 254) and ("affiliates"."phone" is null or "affiliates"."phone" ~ '^[+][1-9][0-9]{7,14}$')),
	CONSTRAINT "affiliates_reward_check" CHECK (("affiliates"."reward_kind" = 'amount' and "affiliates"."reward_amount_cents" is not null and "affiliates"."reward_amount_cents" >= 0 and "affiliates"."reward_currency" is not null and "affiliates"."reward_percent_basis_points" is null) or ("affiliates"."reward_kind" = 'percent' and "affiliates"."reward_percent_basis_points" is not null and "affiliates"."reward_percent_basis_points" between 1 and 10000 and "affiliates"."reward_amount_cents" is null and "affiliates"."reward_currency" is null)),
	CONSTRAINT "affiliates_notes_check" CHECK ("affiliates"."notes" is null or char_length("affiliates"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_discount_check";--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_discount_check";--> statement-breakpoint
ALTER TABLE "referral_codes" ALTER COLUMN "discount_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "affiliate_id" uuid;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_payout_id_affiliate_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_cancelled_by_staff_id_users_id_fk" FOREIGN KEY ("cancelled_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_recorded_by_staff_id_users_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_discount_plans" ADD CONSTRAINT "provider_discount_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_earnings_payment_idx" ON "affiliate_earnings" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "affiliate_earnings_affiliate_idx" ON "affiliate_earnings" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_affiliate_idx" ON "affiliate_payouts" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_discount_plans_plan_discount_idx" ON "provider_discount_plans" USING btree ("plan_id","discount_amount_cents","provider");--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_codes_affiliate_idx" ON "referral_codes" USING btree ("affiliate_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_check" CHECK ("subscriptions"."discount_amount_cents" >= 0 and ("subscriptions"."referral_code_id" is not null or "subscriptions"."discount_amount_cents" = 0));--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_discount_check" CHECK (("referral_codes"."discount_kind" is null and "referral_codes"."affiliate_id" is not null and "referral_codes"."discount_amount_cents" is null and "referral_codes"."discount_percent_basis_points" is null) or ("referral_codes"."discount_kind" = 'amount' and "referral_codes"."discount_amount_cents" is not null and "referral_codes"."discount_amount_cents" > 0 and "referral_codes"."discount_percent_basis_points" is null) or ("referral_codes"."discount_kind" = 'percent' and "referral_codes"."discount_percent_basis_points" is not null and "referral_codes"."discount_percent_basis_points" between 1 and 9900 and "referral_codes"."discount_amount_cents" is null));
--> statement-breakpoint

INSERT INTO "affiliates" ("id", "name", "email", "reward_kind", "reward_amount_cents", "reward_currency", "reward_percent_basis_points", "created_by_staff_id", "created_at", "updated_at")
SELECT DISTINCT ON (lower(btrim("referrer_email")))
	gen_random_uuid(),
	btrim("referrer_name"),
	btrim("referrer_email"),
	"reward_kind",
	CASE WHEN "reward_kind" = 'amount' THEN "reward_amount_cents" END,
	CASE WHEN "reward_kind" = 'amount' THEN "currency" END,
	CASE WHEN "reward_kind" = 'percent' THEN "reward_percent_basis_points" END,
	"created_by_staff_id",
	"created_at",
	now()
FROM "referral_codes"
ORDER BY lower(btrim("referrer_email")), "created_at", "id";
--> statement-breakpoint

UPDATE "referral_codes" AS rc
SET "affiliate_id" = a."id"
FROM "affiliates" AS a
WHERE lower(btrim(a."email")) = lower(btrim(rc."referrer_email"));
--> statement-breakpoint

-- Staff-only, like referral_codes (0030): fynix_app is granted nothing on any of these tables. Earnings and
-- payouts are never deleted; a payout is never edited. Earnings change status (owed to paid or cancelled) only.
GRANT SELECT, INSERT, UPDATE ON "affiliates" TO fynix_staff;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "affiliate_earnings" TO fynix_staff;
--> statement-breakpoint
GRANT SELECT, INSERT ON "affiliate_payouts" TO fynix_staff;
--> statement-breakpoint
GRANT SELECT, INSERT ON "provider_discount_plans" TO fynix_staff;
--> statement-breakpoint
ALTER TABLE "affiliates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provider_discount_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY affiliates_staff_all ON "affiliates" FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY affiliate_earnings_staff_all ON "affiliate_earnings" FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY affiliate_payouts_staff_all ON "affiliate_payouts" FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY provider_discount_plans_staff_all ON "provider_discount_plans" FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
