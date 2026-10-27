CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"destination" text NOT NULL,
	"title" text NOT NULL,
	"result" text NOT NULL,
	"card" jsonb,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_deliveries_destination_check" CHECK ("alert_deliveries"."destination" in ('enquiries', 'payments', 'customers', 'support', 'system')),
	CONSTRAINT "alert_deliveries_result_check" CHECK ("alert_deliveries"."result" in ('sent', 'rejected', 'unreachable', 'unreadable')),
	CONSTRAINT "alert_deliveries_title_check" CHECK (char_length("alert_deliveries"."title") between 1 and 200),
	CONSTRAINT "alert_deliveries_attempts_check" CHECK ("alert_deliveries"."attempts" >= 1),
	CONSTRAINT "alert_deliveries_card_check" CHECK ("alert_deliveries"."result" <> 'sent' or "alert_deliveries"."card" is null)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"result" text NOT NULL,
	"error" text,
	"business_id" uuid,
	"body_sha256" text NOT NULL,
	"body_bytes" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_source_check" CHECK ("webhook_events"."source" in ('razorpay', 'calcom', 'oyechats')),
	CONSTRAINT "webhook_events_result_check" CHECK ("webhook_events"."result" in ('handled', 'ignored', 'failed', 'bad_signature')),
	CONSTRAINT "webhook_events_event_type_check" CHECK (char_length("webhook_events"."event_type") between 1 and 64),
	CONSTRAINT "webhook_events_error_check" CHECK ("webhook_events"."error" is null or char_length("webhook_events"."error") <= 300),
	CONSTRAINT "webhook_events_body_sha256_check" CHECK ("webhook_events"."body_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "webhook_events_body_bytes_check" CHECK ("webhook_events"."body_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "status" text DEFAULT 'local_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "body_redacted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_deliveries_created_at_idx" ON "alert_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_status_check" CHECK ("email_messages"."status" in ('sent', 'local_only', 'failed'));--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_error_check" CHECK ("email_messages"."error" is null or char_length("email_messages"."error") <= 300);--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_attempts_check" CHECK ("email_messages"."attempts" >= 1);
--> statement-breakpoint

-- Rows written before this migration: Brevo rows were sent; the rest stay local_only (a failure then looked the same as local mail).
UPDATE email_messages SET status = 'sent' WHERE transport = 'brevo';
--> statement-breakpoint

-- Sign-in link emails were always stored as a redacted copy on a real deployment.
UPDATE email_messages SET body_redacted = true WHERE template IN ('password-reset', 'confirm-email', 'setup-link');
--> statement-breakpoint

-- Staff record a resend's result on the email's own row.
GRANT UPDATE ON email_messages TO bb_staff;
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON webhook_events TO bb_staff;
--> statement-breakpoint

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY webhook_events_staff_all ON webhook_events FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON alert_deliveries TO bb_staff;
--> statement-breakpoint

ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY alert_deliveries_staff_all ON alert_deliveries FOR ALL TO bb_staff USING (true) WITH CHECK (true);
