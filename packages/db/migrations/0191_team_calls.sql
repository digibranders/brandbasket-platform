CREATE TABLE "team_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text DEFAULT 'dashboard' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"provider_uri" text,
	"held_at" timestamp with time zone,
	"held_by_staff_id" text,
	"cancelled_at" timestamp with time zone,
	"summary" text,
	"summary_at" timestamp with time zone,
	"summary_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_calls_reason_check" CHECK ("team_calls"."reason" in ('website', 'social', 'search', 'billing', 'other')),
	CONSTRAINT "team_calls_status_check" CHECK ("team_calls"."status" in ('booked', 'held', 'cancelled')),
	CONSTRAINT "team_calls_source_check" CHECK ("team_calls"."source" in ('dashboard', 'booking_page')),
	CONSTRAINT "team_calls_note_check" CHECK ("team_calls"."note" is null or char_length(btrim("team_calls"."note")) between 1 and 500),
	CONSTRAINT "team_calls_time_check" CHECK ("team_calls"."ends_at" > "team_calls"."starts_at"),
	CONSTRAINT "team_calls_provider_check" CHECK ("team_calls"."provider_uri" is null or char_length("team_calls"."provider_uri") <= 300),
	CONSTRAINT "team_calls_held_check" CHECK (("team_calls"."status" = 'held') = ("team_calls"."held_at" is not null) and ("team_calls"."held_at" is null) = ("team_calls"."held_by_staff_id" is null)),
	CONSTRAINT "team_calls_cancelled_check" CHECK (("team_calls"."status" = 'cancelled') = ("team_calls"."cancelled_at" is not null)),
	CONSTRAINT "team_calls_summary_check" CHECK (("team_calls"."summary" is null) = ("team_calls"."summary_at" is null) and ("team_calls"."summary" is null) = ("team_calls"."summary_by_staff_id" is null) and ("team_calls"."summary" is null or ("team_calls"."status" = 'held' and char_length(btrim("team_calls"."summary")) between 3 and 600)))
);
--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD COLUMN "summary_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD COLUMN "summary_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "team_calls" ADD CONSTRAINT "team_calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_calls" ADD CONSTRAINT "team_calls_held_by_staff_id_users_id_fk" FOREIGN KEY ("held_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_calls" ADD CONSTRAINT "team_calls_summary_by_staff_id_users_id_fk" FOREIGN KEY ("summary_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_calls_business_idx" ON "team_calls" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_calls_provider_idx" ON "team_calls" USING btree ("provider_uri");--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD CONSTRAINT "setup_call_bookings_summary_by_staff_id_users_id_fk" FOREIGN KEY ("summary_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD CONSTRAINT "setup_call_bookings_summary_check" CHECK (("setup_call_bookings"."summary" is null) = ("setup_call_bookings"."summary_at" is null) and ("setup_call_bookings"."summary" is null) = ("setup_call_bookings"."summary_by_staff_id" is null) and ("setup_call_bookings"."summary" is null or ("setup_call_bookings"."held_at" is not null and char_length(btrim("setup_call_bookings"."summary")) between 3 and 600)));
--> statement-breakpoint
-- A customer books a call and cancels one that has not happened, and reads their own business's calls. Staff mark a call
-- held and write what was agreed; Cal.com's webhook (the staff connection) records, moves and cancels. A call is never
-- deleted except when the account is erased.
GRANT SELECT, INSERT, UPDATE ON team_calls TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON team_calls TO bb_staff;
--> statement-breakpoint
ALTER TABLE team_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY team_calls_tenant_all ON team_calls
  FOR ALL TO bb_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY team_calls_staff_all ON team_calls FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The rule book for a call, for every writer. A call's business, reason, note and source never change. A cancelled call stays
-- cancelled, and a held call cannot be cancelled (it happened). The customer role may add a booked call and may do one
-- thing to it afterwards: cancel it. Everything else (held, summary) is staff's, written on the staff connection.
CREATE OR REPLACE FUNCTION public.team_calls_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'bb_app' AND (
         NEW.status <> 'booked' OR NEW.source <> 'dashboard' OR NEW.held_at IS NOT NULL OR NEW.held_by_staff_id IS NOT NULL
         OR NEW.cancelled_at IS NOT NULL OR NEW.summary IS NOT NULL OR NEW.summary_at IS NOT NULL OR NEW.summary_by_staff_id IS NOT NULL) THEN
      RAISE EXCEPTION '% may only add a booked call', current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id, NEW.business_id, NEW.reason, NEW.note, NEW.source, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.reason, OLD.note, OLD.source, OLD.created_at) THEN
    RAISE EXCEPTION 'A call''s business, reason, note and source cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled call stays cancelled' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'held' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'A call that was held cannot be cancelled' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user = 'bb_app' AND (
       NOT (OLD.status = 'booked' AND NEW.status = 'cancelled')
       OR ROW(NEW.starts_at, NEW.ends_at, NEW.provider_uri, NEW.held_at, NEW.held_by_staff_id, NEW.summary, NEW.summary_at, NEW.summary_by_staff_id)
          IS DISTINCT FROM ROW(OLD.starts_at, OLD.ends_at, OLD.provider_uri, OLD.held_at, OLD.held_by_staff_id, OLD.summary, OLD.summary_at, OLD.summary_by_staff_id)) THEN
    RAISE EXCEPTION '% may only cancel a booked call', current_user USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER team_calls_guard
  BEFORE INSERT OR UPDATE ON team_calls
  FOR EACH ROW EXECUTE FUNCTION public.team_calls_guard();
--> statement-breakpoint
-- The kickoff call's summary is staff's, like its held mark (0188): the customer connection may not set it. The function keeps
-- its name, so the trigger that already calls it now covers the summary too.
CREATE OR REPLACE FUNCTION public.setup_call_bookings_guard_held()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF current_user = 'bb_app' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.held_at IS NOT NULL OR NEW.held_by_staff_id IS NOT NULL OR NEW.summary IS NOT NULL OR NEW.summary_at IS NOT NULL OR NEW.summary_by_staff_id IS NOT NULL THEN
        RAISE EXCEPTION '% may not mark a call as held or write what was agreed', current_user USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF ROW(NEW.held_at, NEW.held_by_staff_id, NEW.summary, NEW.summary_at, NEW.summary_by_staff_id)
          IS DISTINCT FROM ROW(OLD.held_at, OLD.held_by_staff_id, OLD.summary, OLD.summary_at, OLD.summary_by_staff_id) THEN
      RAISE EXCEPTION '% may not mark a call as held or write what was agreed', current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
