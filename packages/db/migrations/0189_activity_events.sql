CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_actor_kind_check" CHECK ("activity_events"."actor_kind" in ('staff', 'client', 'system', 'provider')),
	CONSTRAINT "activity_events_kind_check" CHECK (char_length("activity_events"."kind") between 1 and 64),
	CONSTRAINT "activity_events_summary_check" CHECK (char_length("activity_events"."summary") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_business_created_idx" ON "activity_events" USING btree ("business_id","created_at");
--> statement-breakpoint

GRANT SELECT, INSERT ON activity_events TO bb_staff;
--> statement-breakpoint

GRANT SELECT ON activity_events TO bb_app;
--> statement-breakpoint

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY activity_events_staff_all ON activity_events FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY activity_events_tenant_read ON activity_events
  FOR SELECT TO bb_app
  USING (business_id = app_current_business_id() AND visible_to_client);
