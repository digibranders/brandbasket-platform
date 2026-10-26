CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_service_check" CHECK ("activity_events"."service" is null or "activity_events"."service" in ('website', 'social', 'search')),
	CONSTRAINT "activity_events_title_check" CHECK (char_length("activity_events"."title") between 3 and 140)
);
--> statement-breakpoint
CREATE TABLE "monthly_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text NOT NULL,
	"month" date NOT NULL,
	"ad_spend_cents" integer,
	"ad_budget_cents" integer,
	"ad_enquiries" integer,
	"posts_published" integer,
	"posts_planned" integer,
	"keywords_page_one" integer,
	"keywords_page_one_prev" integer,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_snapshots_service_check" CHECK ("monthly_snapshots"."service" in ('social', 'search')),
	CONSTRAINT "monthly_snapshots_month_check" CHECK (extract(day from "monthly_snapshots"."month") = 1),
	CONSTRAINT "monthly_snapshots_figures_check" CHECK (coalesce("monthly_snapshots"."ad_spend_cents", 0) >= 0 and coalesce("monthly_snapshots"."ad_budget_cents", 0) >= 0 and coalesce("monthly_snapshots"."ad_enquiries", 0) >= 0
        and coalesce("monthly_snapshots"."posts_published", 0) >= 0 and coalesce("monthly_snapshots"."posts_planned", 0) >= 0
        and coalesce("monthly_snapshots"."keywords_page_one", 0) >= 0 and coalesce("monthly_snapshots"."keywords_page_one_prev", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_setup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_setup_service_check" CHECK ("service_setup"."service" in ('social', 'search'))
);
--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD COLUMN "held_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_updated_by_staff_id_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_setup" ADD CONSTRAINT "service_setup_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_business_idx" ON "activity_events" USING btree ("business_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_snapshots_business_service_month_idx" ON "monthly_snapshots" USING btree ("business_id","service","month");--> statement-breakpoint
CREATE UNIQUE INDEX "service_setup_business_service_idx" ON "service_setup" USING btree ("business_id","service");--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD CONSTRAINT "setup_call_bookings_held_by_staff_id_users_id_fk" FOREIGN KEY ("held_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Customers read and write their own Social and Search answers; staff can do everything.
GRANT SELECT, INSERT, UPDATE ON service_setup TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON service_setup TO bb_staff;
--> statement-breakpoint
ALTER TABLE service_setup ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_setup_tenant_all ON service_setup FOR ALL TO bb_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY service_setup_staff_all ON service_setup FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Staff write updates; the customer only reads their own.
GRANT SELECT ON activity_events TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_events TO bb_staff;
--> statement-breakpoint
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY activity_events_tenant_select ON activity_events FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY activity_events_staff_all ON activity_events FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Staff enter the numbers; the customer only reads their own.
GRANT SELECT ON monthly_snapshots TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_snapshots TO bb_staff;
--> statement-breakpoint
ALTER TABLE monthly_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY monthly_snapshots_tenant_select ON monthly_snapshots FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY monthly_snapshots_staff_all ON monthly_snapshots FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The customer's table-level INSERT and UPDATE rights on setup_call_bookings cover every column, and a column REVOKE cannot
-- take part of them back. Narrowing them to a column list would break the customer's own booking insert too, because an
-- insert names every column (the held ones as DEFAULT) and Postgres checks the privilege for each name. So, as in
-- 0132_role_guards.sql, a trigger stops the customer connection from setting who held the call and when. Staff and
-- system paths write those on the staff connection.
CREATE OR REPLACE FUNCTION public.setup_call_bookings_guard_held()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF current_user = 'bb_app' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.held_at IS NOT NULL OR NEW.held_by_staff_id IS NOT NULL THEN
        RAISE EXCEPTION '% may not mark a call as held', current_user USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.held_at IS DISTINCT FROM OLD.held_at OR NEW.held_by_staff_id IS DISTINCT FROM OLD.held_by_staff_id THEN
      RAISE EXCEPTION '% may not mark a call as held', current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER setup_call_bookings_guard_held
  BEFORE INSERT OR UPDATE ON setup_call_bookings
  FOR EACH ROW EXECUTE FUNCTION public.setup_call_bookings_guard_held();
