CREATE TYPE "public"."account_exit_outcome" AS ENUM('kept_with_offer', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."account_exit_reason" AS ENUM('too_expensive', 'not_enough_enquiries', 'not_using', 'missing_feature', 'found_alternative', 'closing_business', 'other');--> statement-breakpoint
CREATE TABLE "account_closures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erase_after" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_closures_erase_after_check" CHECK ("account_closures"."erase_after" > "account_closures"."requested_at"),
	CONSTRAINT "account_closures_closed_once_check" CHECK (not ("account_closures"."restored_at" is not null and "account_closures"."erased_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "account_exit_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reason" "account_exit_reason" NOT NULL,
	"comment" text,
	"plan_code" text,
	"offer_percent" integer,
	"outcome" "account_exit_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_exit_feedback_comment_check" CHECK ("account_exit_feedback"."comment" is null or (char_length("account_exit_feedback"."comment") between 1 and 1000 and "account_exit_feedback"."comment" = btrim("account_exit_feedback"."comment"))),
	CONSTRAINT "account_exit_feedback_offer_check" CHECK ("account_exit_feedback"."offer_percent" is null or "account_exit_feedback"."offer_percent" between 1 and 99),
	CONSTRAINT "account_exit_feedback_kept_check" CHECK ("account_exit_feedback"."outcome" <> 'kept_with_offer' or "account_exit_feedback"."offer_percent" is not null)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_discount_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "retention_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_closures" ADD CONSTRAINT "account_closures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_closures" ADD CONSTRAINT "account_closures_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_closures_one_open_per_user_idx" ON "account_closures" USING btree ("user_id") WHERE "account_closures"."restored_at" is null and "account_closures"."erased_at" is null;--> statement-breakpoint
CREATE INDEX "account_closures_erase_after_idx" ON "account_closures" USING btree ("erase_after");--> statement-breakpoint
CREATE INDEX "account_exit_feedback_created_at_idx" ON "account_exit_feedback" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_check" CHECK ("subscriptions"."discount_amount_cents" >= 0 and "subscriptions"."retention_discount_cents" >= 0 and "subscriptions"."retention_discount_cents" <= "subscriptions"."discount_amount_cents" and ("subscriptions"."referral_code_id" is not null or "subscriptions"."discount_amount_cents" = "subscriptions"."retention_discount_cents"));
--> statement-breakpoint
-- Grants and row-level security, in the pattern of 0084: the platform and the staff console write these on the staff
-- connection after checking the signed-in customer; the customer's own database role gets nothing. Feedback is
-- written once and never changed, and nothing is ever deleted: a closure is closed by stamping it.
GRANT SELECT, INSERT, UPDATE ON "account_closures" TO webfold_staff;
--> statement-breakpoint

GRANT SELECT, INSERT ON "account_exit_feedback" TO webfold_staff;
--> statement-breakpoint

ALTER TABLE "account_closures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "account_exit_feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY account_closures_staff_all ON "account_closures" FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY account_exit_feedback_staff_all ON "account_exit_feedback" FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
