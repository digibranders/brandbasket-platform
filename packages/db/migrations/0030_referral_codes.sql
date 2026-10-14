-- Referral codes: a superadmin-created code that takes a whole-number percentage off every month of a
-- subscription. The discount itself is taken at Razorpay through an Offer (referral_codes.provider_offer_id,
-- passed as offer_id when the subscription is created); this schema holds our own record of the deal and, on
-- subscriptions, a frozen copy of what the code is worth so that editing or retiring a code can never change what
-- an existing customer is charged. See docs/superpowers/specs/2026-09-22-referral-codes-design.md.
--
-- reward_amount_cents records what the referrer is owed per paid month. Nothing reads it yet: accruing and paying
-- it out is Phase 2. It is stored from the start so a code is a complete record of its referral agreement.
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"currency" "billing_currency" NOT NULL,
	"discount_percent" integer NOT NULL,
	"provider_offer_id" text,
	"referrer_name" text NOT NULL,
	"referrer_email" text NOT NULL,
	"reward_amount_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"max_redemptions" integer,
	"created_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_codes_code_format_check" CHECK ("referral_codes"."code" ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
	CONSTRAINT "referral_codes_percent_check" CHECK ("referral_codes"."discount_percent" between 1 and 99),
	CONSTRAINT "referral_codes_reward_check" CHECK ("referral_codes"."reward_amount_cents" >= 0),
	CONSTRAINT "referral_codes_max_redemptions_check" CHECK ("referral_codes"."max_redemptions" is null or "referral_codes"."max_redemptions" > 0),
	CONSTRAINT "referral_codes_referrer_check" CHECK (char_length(btrim("referral_codes"."referrer_name")) between 1 and 120 and char_length(btrim("referral_codes"."referrer_email")) between 3 and 254),
	CONSTRAINT "referral_codes_offer_id_check" CHECK ("referral_codes"."provider_offer_id" is null or "referral_codes"."provider_offer_id" <> '')
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "referral_code_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "referral_code_id" uuid;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_codes_active_idx" ON "referral_codes" USING btree ("active","currency");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_check" CHECK ("subscriptions"."discount_amount_cents" >= 0 and ("subscriptions"."referral_code_id" is null) = ("subscriptions"."discount_amount_cents" = 0));
--> statement-breakpoint

-- Referral codes are staff-only. webfold_app is deliberately granted nothing: the customer's own role never reads
-- this table, and every lookup made on a customer's behalf runs on the staff connection, like the rest of billing.
GRANT SELECT, INSERT, UPDATE ON referral_codes TO webfold_staff;
--> statement-breakpoint

-- Applying and removing a code writes businesses.referral_code_id, which is billing state, so only staff may do it.
-- webfold_app keeps its existing SELECT on businesses and gains no write.
GRANT UPDATE (referral_code_id) ON businesses TO webfold_staff;
--> statement-breakpoint

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY referral_codes_staff_all ON referral_codes FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
