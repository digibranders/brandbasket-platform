CREATE TABLE "sales_redemption_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_redemption_events_attempts_check" CHECK ("sales_redemption_events"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sales_redemption_events" ADD CONSTRAINT "sales_redemption_events_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_redemption_events" ADD CONSTRAINT "sales_redemption_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_redemption_events" ADD CONSTRAINT "sales_redemption_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_redemption_events_payment_idx" ON "sales_redemption_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "sales_redemption_events_pending_idx" ON "sales_redemption_events" USING btree ("next_attempt_at") WHERE "sales_redemption_events"."delivered_at" is null;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sales_redemption_events" TO bb_staff;
--> statement-breakpoint
ALTER TABLE "sales_redemption_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sales_redemption_events_staff_all ON "sales_redemption_events" FOR ALL TO bb_staff USING (true) WITH CHECK (true);
