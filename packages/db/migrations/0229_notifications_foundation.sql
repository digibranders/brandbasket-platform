CREATE TABLE "email_suppressions" (
	"address" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_reason_check" CHECK ("email_suppressions"."reason" in ('bounce', 'complaint', 'unsubscribe')),
	CONSTRAINT "email_suppressions_address_check" CHECK ("email_suppressions"."address" = lower("email_suppressions"."address") and char_length("email_suppressions"."address") between 3 and 320)
);
--> statement-breakpoint
CREATE TABLE "kickoff_prompt_state" (
	"call_id" uuid PRIMARY KEY NOT NULL,
	"first_notified_at" timestamp with time zone,
	"last_popup_shown_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"reminder_pushed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"business_id" uuid,
	"user_id" text,
	"event_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"listed" boolean DEFAULT true NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_dedupe_idx" UNIQUE NULLS NOT DISTINCT("audience","user_id","dedupe_key"),
	CONSTRAINT "notifications_audience_check" CHECK ("notifications"."audience" in ('customer', 'staff')),
	CONSTRAINT "notifications_recipient_check" CHECK (("notifications"."audience" = 'customer' and "notifications"."user_id" is not null and "notifications"."business_id" is not null) or ("notifications"."audience" = 'staff' and "notifications"."user_id" is null)),
	CONSTRAINT "notifications_title_check" CHECK (char_length("notifications"."title") between 1 and 200),
	CONSTRAINT "notifications_body_check" CHECK ("notifications"."body" is null or char_length("notifications"."body") <= 500),
	CONSTRAINT "notifications_link_check" CHECK ("notifications"."link" is null or ("notifications"."link" like '/%' and "notifications"."link" not like '//%' and char_length("notifications"."link") <= 300)),
	CONSTRAINT "notifications_dedupe_key_check" CHECK (char_length("notifications"."dedupe_key") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_idx" UNIQUE("endpoint"),
	CONSTRAINT "push_subscriptions_audience_check" CHECK ("push_subscriptions"."audience" in ('customer', 'staff')),
	CONSTRAINT "push_subscriptions_endpoint_check" CHECK ("push_subscriptions"."endpoint" like 'https://%' and char_length("push_subscriptions"."endpoint") <= 2048),
	CONSTRAINT "push_subscriptions_user_agent_check" CHECK ("push_subscriptions"."user_agent" is null or char_length("push_subscriptions"."user_agent") <= 300)
);
--> statement-breakpoint
ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_source_check";--> statement-breakpoint
ALTER TABLE "email_messages" DROP CONSTRAINT "email_messages_status_check";--> statement-breakpoint
ALTER TABLE "email_messages" DROP CONSTRAINT "email_messages_attempts_check";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_topic_check";--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "bell" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "push" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kickoff_prompt_state" ADD CONSTRAINT "kickoff_prompt_state_call_id_setup_call_bookings_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."setup_call_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("user_id","business_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_audience_created_at_idx" ON "notifications" USING btree ("audience","created_at");--> statement-breakpoint
CREATE INDEX "notifications_business_id_idx" ON "notifications" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("source","event_id") WHERE "webhook_events"."event_id" is not null and "webhook_events"."result" in ('handled', 'ignored');--> statement-breakpoint
CREATE INDEX "email_messages_pending_idx" ON "email_messages" USING btree ("next_attempt_at") WHERE "email_messages"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_event_id_check" CHECK ("webhook_events"."event_id" is null or char_length("webhook_events"."event_id") between 1 and 200);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_source_check" CHECK ("webhook_events"."source" in ('razorpay', 'calcom', 'oyechats', 'brevo', 'social_auto'));--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_max_attempts_check" CHECK ("email_messages"."max_attempts" >= 1);--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_pending_check" CHECK ("email_messages"."status" <> 'pending' or "email_messages"."next_attempt_at" is not null);--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_status_check" CHECK ("email_messages"."status" in ('pending', 'sent', 'local_only', 'failed', 'bounced'));--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_attempts_check" CHECK ("email_messages"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_topic_check" CHECK ("notification_preferences"."topic" in ('new_enquiry', 'needs_approval', 'request_reply', 'billing', 'monthly_report', 'product_news', 'calls', 'social'));--> statement-breakpoint
-- Product news is the one topic that is off by default, so a row made before the bell had a column starts with the bell off too.
UPDATE notification_preferences SET bell = false WHERE topic = 'product_news';--> statement-breakpoint

-- notifications: a customer reads their own rows for the business they are scoped to (any role, viewers included) and marks
-- them read, nothing else. Everything else is written, listed and purged with the staff connection (notify() and the nightly job).
GRANT SELECT ON notifications TO bb_app;--> statement-breakpoint
GRANT UPDATE (read_at) ON notifications TO bb_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO bb_staff;--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notifications_own_select ON notifications FOR SELECT TO bb_app
  USING (audience = 'customer' AND user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL);--> statement-breakpoint
CREATE POLICY notifications_own_read ON notifications FOR UPDATE TO bb_app
  USING (audience = 'customer' AND user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL)
  WITH CHECK (audience = 'customer' AND user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL);--> statement-breakpoint
CREATE POLICY notifications_staff_all ON notifications FOR ALL TO bb_staff USING (true) WITH CHECK (true);--> statement-breakpoint

-- push_subscriptions: each person manages the browsers they signed in on (customer rows only); the console and the sender use the staff connection.
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO bb_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO bb_staff;--> statement-breakpoint
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY push_subscriptions_own ON push_subscriptions FOR ALL TO bb_app
  USING (audience = 'customer' AND user_id = app_current_user_id())
  WITH CHECK (audience = 'customer' AND user_id = app_current_user_id());--> statement-breakpoint
CREATE POLICY push_subscriptions_staff_all ON push_subscriptions FOR ALL TO bb_staff USING (true) WITH CHECK (true);--> statement-breakpoint

-- kickoff_prompt_state and email_suppressions: staff and system work only. The customer role has no grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON kickoff_prompt_state TO bb_staff;--> statement-breakpoint
ALTER TABLE kickoff_prompt_state ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY kickoff_prompt_state_staff_all ON kickoff_prompt_state FOR ALL TO bb_staff USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON email_suppressions TO bb_staff;--> statement-breakpoint
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY email_suppressions_staff_all ON email_suppressions FOR ALL TO bb_staff USING (true) WITH CHECK (true);
