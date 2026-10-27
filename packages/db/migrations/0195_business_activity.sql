CREATE TABLE "business_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_activity_actor_kind_check" CHECK ("business_activity"."actor_kind" in ('staff', 'client', 'system', 'provider')),
	CONSTRAINT "business_activity_kind_check" CHECK (char_length("business_activity"."kind") between 1 and 64),
	CONSTRAINT "business_activity_summary_check" CHECK (char_length("business_activity"."summary") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "business_activity" ADD CONSTRAINT "business_activity_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_activity_business_created_idx" ON "business_activity" USING btree ("business_id","created_at");
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON business_activity TO bb_staff;
--> statement-breakpoint

GRANT SELECT ON business_activity TO bb_app;
--> statement-breakpoint

ALTER TABLE business_activity ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_activity_staff_all ON business_activity FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY business_activity_tenant_read ON business_activity
  FOR SELECT TO bb_app
  USING (business_id = app_current_business_id() AND visible_to_client);
