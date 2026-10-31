CREATE TABLE "conversion_events" (
	"payment_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversion_events_payment_id_destination_pk" PRIMARY KEY("payment_id","destination"),
	CONSTRAINT "conversion_events_destination_check" CHECK ("conversion_events"."destination" in ('ga4', 'meta')),
	CONSTRAINT "conversion_events_status_check" CHECK ("conversion_events"."status" in ('pending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "conversion_events_reason_check" CHECK ("conversion_events"."reason" is null or char_length("conversion_events"."reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Written by the payment's own server code on the staff connection, read by the console. A customer reads none of it, so
-- there is no grant to the app role. Rows are kept with the payment they describe (payments are kept when an account is erased).
GRANT SELECT, INSERT, UPDATE ON conversion_events TO bb_staff;
--> statement-breakpoint
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY conversion_events_staff_all ON conversion_events FOR ALL TO bb_staff USING (true) WITH CHECK (true);
