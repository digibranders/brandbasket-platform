CREATE TABLE "client_intakes" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"asked_for_services" text[] DEFAULT '{}'::text[] NOT NULL,
	"business_type" text,
	"business_subtype" text,
	"primary_goal" text,
	"website_state" text,
	"existing_website_url" text,
	"primary_action" text,
	"design_direction" text,
	"social_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_scope" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_intakes_services_check" CHECK ("client_intakes"."asked_for_services" <@ array['managed-website', 'digital-growth', 'local-seo-aeo']::text[]),
	CONSTRAINT "client_intakes_size_check" CHECK (coalesce(char_length("client_intakes"."business_type"), 0) <= 60 and coalesce(char_length("client_intakes"."business_subtype"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_goal"), 0) <= 60
        and coalesce(char_length("client_intakes"."website_state"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_action"), 0) <= 60 and coalesce(char_length("client_intakes"."design_direction"), 0) <= 60
        and coalesce(char_length("client_intakes"."search_scope"), 0) <= 60 and coalesce(char_length("client_intakes"."existing_website_url"), 0) <= 300
        and cardinality("client_intakes"."social_channels") <= 8 and cardinality("client_intakes"."asked_for_services") <= 3)
);
--> statement-breakpoint
ALTER TABLE "client_intakes" ADD CONSTRAINT "client_intakes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- The customer reads and writes only their own row, before and after paying; they never delete it. Staff can do everything.
GRANT SELECT, INSERT, UPDATE ON client_intakes TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON client_intakes TO bb_staff;
--> statement-breakpoint
ALTER TABLE client_intakes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_intakes_tenant_select ON client_intakes FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY client_intakes_tenant_insert ON client_intakes FOR INSERT TO bb_app
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY client_intakes_tenant_update ON client_intakes FOR UPDATE TO bb_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY client_intakes_staff_all ON client_intakes FOR ALL TO bb_staff USING (true) WITH CHECK (true);
