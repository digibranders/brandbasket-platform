-- The system lets go of a change quote's open charge itself when the account that asked for it is erased, as it does a move
-- up's and an add-on's, so the charge's waived-by rule names change_hours beside them.
ALTER TABLE "charges" DROP CONSTRAINT "charges_status_check";--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_status_check" CHECK (case "charges"."status"
        when 'open' then "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is null
        when 'paid' then "charges"."payment_id" is not null and "charges"."paid_at" is not null and "charges"."waived_at" is null
        else "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is not null and ("charges"."waived_by_staff_id" is not null or "charges"."kind" in ('directory_ad', 'plan_upgrade', 'add_on', 'change_hours'))
      end);--> statement-breakpoint
CREATE TABLE "change_request_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"change_request_id" uuid NOT NULL,
	"state" text NOT NULL,
	"actor_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_request_events_state_check" CHECK ("change_request_events"."state" in ('requested', 'quoted', 'in_progress', 'preview', 'revisions', 'approved', 'shipped', 'declined', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"page" text,
	"state" text DEFAULT 'requested' NOT NULL,
	"coverage" text DEFAULT 'undecided' NOT NULL,
	"quote_what" text,
	"quote_hours" integer,
	"quote_unit_cents" integer,
	"quote_amount_cents" integer,
	"quote_currency" "billing_currency",
	"quote_working_days" integer,
	"quoted_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"charge_id" uuid,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_requests_kind_check" CHECK ("change_requests"."kind" in ('website', 'social', 'search', 'billing', 'other')),
	CONSTRAINT "change_requests_page_check" CHECK ("change_requests"."page" is null or char_length(btrim("change_requests"."page")) between 1 and 200),
	CONSTRAINT "change_requests_state_check" CHECK ("change_requests"."state" in ('requested', 'quoted', 'in_progress', 'preview', 'revisions', 'approved', 'shipped', 'declined', 'withdrawn')),
	CONSTRAINT "change_requests_coverage_check" CHECK ("change_requests"."coverage" in ('undecided', 'included', 'free', 'paid')),
	CONSTRAINT "change_requests_quote_whole_check" CHECK (num_nonnulls("change_requests"."quote_what", "change_requests"."quote_hours", "change_requests"."quote_unit_cents", "change_requests"."quote_amount_cents", "change_requests"."quote_currency", "change_requests"."quote_working_days", "change_requests"."quoted_at") in (0, 7)),
	CONSTRAINT "change_requests_quote_values_check" CHECK ("change_requests"."quote_hours" is null or ("change_requests"."quote_hours" between 1 and 40 and "change_requests"."quote_unit_cents" >= 1 and "change_requests"."quote_amount_cents" = "change_requests"."quote_hours" * "change_requests"."quote_unit_cents" and "change_requests"."quote_working_days" between 1 and 30 and char_length(btrim("change_requests"."quote_what")) between 3 and 80)),
	CONSTRAINT "change_requests_coverage_quote_check" CHECK (("change_requests"."coverage" = 'paid') = ("change_requests"."quote_hours" is not null)),
	CONSTRAINT "change_requests_decided_check" CHECK ("change_requests"."coverage" <> 'undecided' or "change_requests"."state" in ('requested', 'declined', 'withdrawn')),
	CONSTRAINT "change_requests_quoted_check" CHECK ("change_requests"."state" <> 'quoted' or "change_requests"."coverage" = 'paid'),
	CONSTRAINT "change_requests_charge_check" CHECK (("change_requests"."charge_id" is null) = ("change_requests"."accepted_at" is null)),
	CONSTRAINT "change_requests_reason_check" CHECK ("change_requests"."closed_reason" is null or ("change_requests"."state" = 'declined' and char_length(btrim("change_requests"."closed_reason")) between 3 and 300))
);
--> statement-breakpoint
ALTER TABLE "change_request_events" ADD CONSTRAINT "change_request_events_change_request_id_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_events" ADD CONSTRAINT "change_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_request_events_request_idx" ON "change_request_events" USING btree ("change_request_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_ticket_idx" ON "change_requests" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "change_requests_business_idx" ON "change_requests" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "change_requests_state_idx" ON "change_requests" USING btree ("state","updated_at");
--> statement-breakpoint
-- Customers read the requests of the business they are signed in to and write nothing: every customer change goes
-- through the named functions below. Staff read and update; only the database's triggers write the event history.
GRANT SELECT ON change_requests, change_request_events TO bb_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON change_requests TO bb_staff;
--> statement-breakpoint
GRANT SELECT ON change_request_events TO bb_staff;
--> statement-breakpoint
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE change_request_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY change_requests_tenant_select ON change_requests FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY change_requests_staff_all ON change_requests FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY change_request_events_tenant_select ON change_request_events FOR SELECT TO bb_app
  USING (EXISTS (SELECT 1 FROM change_requests r WHERE r.id = change_request_events.change_request_id));
--> statement-breakpoint
CREATE POLICY change_request_events_staff_select ON change_request_events FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
-- The one rule book for a request's life, for every writer (staff, the customer functions, a payment). Identity never
-- changes; the quote can change only while it is being decided; a state moves only along these arrows.
CREATE OR REPLACE FUNCTION public.change_requests_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'requested' OR NEW.coverage <> 'undecided' OR NEW.charge_id IS NOT NULL OR NEW.accepted_at IS NOT NULL
       OR NEW.quote_hours IS NOT NULL OR NEW.closed_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A change request begins as requested, undecided and unquoted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = NEW.ticket_id AND t.business_id = NEW.business_id) THEN
      RAISE EXCEPTION 'A change request belongs to its ticket''s business' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id, NEW.ticket_id, NEW.business_id, NEW.kind, NEW.page, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.ticket_id, OLD.business_id, OLD.kind, OLD.page, OLD.created_at) THEN
    RAISE EXCEPTION 'A change request''s identity cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.charge_id IS NOT NULL AND (NEW.charge_id IS DISTINCT FROM OLD.charge_id OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
     AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = OLD.charge_id AND c.status = 'paid') THEN
    RAISE EXCEPTION 'The charge and the acceptance of a paid quote cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.charge_id IS DISTINCT FROM OLD.charge_id THEN
    IF OLD.charge_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = OLD.charge_id AND c.status = 'open') THEN
      RAISE EXCEPTION 'The open charge of an accepted quote must be paid or let go before the request changes' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.charge_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('change-charge:' || NEW.charge_id::text, 0));
      IF NOT EXISTS (SELECT 1 FROM public.charges c WHERE c.id = NEW.charge_id AND c.business_id = NEW.business_id AND c.kind = 'change_hours')
         OR EXISTS (SELECT 1 FROM public.change_requests o WHERE o.charge_id = NEW.charge_id AND o.id <> NEW.id) THEN
        RAISE EXCEPTION 'A change request''s charge must be its own business''s change_hours charge, used by no other request' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF OLD.charge_id IS NOT NULL
     AND ROW(NEW.coverage, NEW.quote_what, NEW.quote_hours, NEW.quote_unit_cents, NEW.quote_amount_cents, NEW.quote_currency, NEW.quote_working_days, NEW.quoted_at)
     IS DISTINCT FROM ROW(OLD.coverage, OLD.quote_what, OLD.quote_hours, OLD.quote_unit_cents, OLD.quote_amount_cents, OLD.quote_currency, OLD.quote_working_days, OLD.quoted_at) THEN
    RAISE EXCEPTION 'The price and cover of a change request are fixed while its charge stands' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(NEW.coverage, NEW.quote_what, NEW.quote_hours, NEW.quote_unit_cents, NEW.quote_amount_cents, NEW.quote_currency, NEW.quote_working_days, NEW.quoted_at)
     IS DISTINCT FROM ROW(OLD.coverage, OLD.quote_what, OLD.quote_hours, OLD.quote_unit_cents, OLD.quote_amount_cents, OLD.quote_currency, OLD.quote_working_days, OLD.quoted_at)
     AND OLD.state NOT IN ('requested', 'quoted') THEN
    RAISE EXCEPTION 'The price and cover of a change request are fixed once work has started' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
    (OLD.state = 'requested' AND NEW.state IN ('quoted', 'in_progress', 'declined', 'withdrawn')) OR
    (OLD.state = 'quoted' AND NEW.state IN ('in_progress', 'declined', 'withdrawn')) OR
    (OLD.state = 'in_progress' AND NEW.state IN ('preview', 'shipped', 'declined')) OR
    (OLD.state = 'preview' AND NEW.state IN ('approved', 'revisions', 'shipped', 'declined')) OR
    (OLD.state = 'revisions' AND NEW.state IN ('preview', 'shipped', 'declined')) OR
    (OLD.state = 'approved' AND NEW.state IN ('shipped', 'revisions')) OR
    (OLD.state = 'shipped' AND NEW.state = 'revisions') OR
    (OLD.state = 'withdrawn' AND NEW.state = 'quoted')
  ) THEN
    RAISE EXCEPTION 'A change request cannot move from % to %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state <> OLD.state AND NEW.state = 'in_progress' AND (NEW.charge_id IS NOT NULL OR NEW.coverage = 'paid')
     AND NOT EXISTS (SELECT 1 FROM public.charges c WHERE c.id = NEW.charge_id AND c.status = 'paid') THEN
    RAISE EXCEPTION 'Work on an accepted quote starts when its charge is paid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state <> OLD.state AND NEW.state IN ('declined', 'withdrawn') AND OLD.charge_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.charges c WHERE c.id = OLD.charge_id AND c.status = 'open') THEN
    RAISE EXCEPTION 'The open charge of an accepted quote must be let go before the request is closed' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER change_requests_guard
  BEFORE INSERT OR UPDATE ON change_requests
  FOR EACH ROW EXECUTE FUNCTION public.change_requests_guard();
--> statement-breakpoint
-- Every state a request enters leaves a dated line (the stepper's dates), whoever moved it. When a request ends, its
-- ticket leaves the staff queue (resolved); when it is reopened, the ticket comes back (triaged), even if it was closed
-- meanwhile, as long as the request ended no more than 14 days ago.
CREATE OR REPLACE FUNCTION public.change_requests_record()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  finals constant text[] := ARRAY['approved', 'shipped', 'declined', 'withdrawn'];
BEGIN
  INSERT INTO public.change_request_events (id, change_request_id, state, actor_user_id)
    VALUES (gen_random_uuid(), NEW.id, NEW.state, public.app_current_user_id());
  IF TG_OP = 'UPDATE' THEN
    IF NEW.state = ANY (finals) AND NOT (OLD.state = ANY (finals)) THEN
      UPDATE public.support_tickets SET status = 'resolved', version = version + 1, updated_at = clock_timestamp()
        WHERE id = NEW.ticket_id AND status NOT IN ('resolved', 'closed') AND retention_started_at IS NULL;
    ELSIF OLD.state = ANY (finals) AND NOT (NEW.state = ANY (finals)) THEN
      UPDATE public.support_tickets SET status = 'triaged', version = version + 1, updated_at = clock_timestamp()
        WHERE id = NEW.ticket_id AND retention_started_at IS NULL AND (status = 'resolved' OR (status = 'closed' AND
          (SELECT max(e.at) FROM public.change_request_events e WHERE e.change_request_id = NEW.id AND e.state = OLD.state) > now() - interval '14 days'));
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER change_requests_record_insert
  AFTER INSERT ON change_requests
  FOR EACH ROW EXECUTE FUNCTION public.change_requests_record();
--> statement-breakpoint
CREATE TRIGGER change_requests_record_update
  AFTER UPDATE ON change_requests
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.change_requests_record();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_requests_record() FROM PUBLIC, bb_app, bb_staff, bb_public;
--> statement-breakpoint
-- A customer's public message on a change that is waiting to be checked asks for a fix: it goes back to the team.
CREATE OR REPLACE FUNCTION public.change_request_customer_message()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.author_role = 'customer' AND NEW.visibility = 'public' THEN
    UPDATE public.change_requests SET state = 'revisions' WHERE ticket_id = NEW.ticket_id AND state = 'preview';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER change_request_customer_message
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION public.change_request_customer_message();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_request_customer_message() FROM PUBLIC, bb_app, bb_staff, bb_public;
--> statement-breakpoint
-- The customer's way in: attaches change details to a ticket they just made for their own business.
CREATE OR REPLACE FUNCTION public.create_change_request(p_ticket_id uuid, p_kind text, p_page text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
  new_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR t.requester_user_id IS DISTINCT FROM public.app_current_user_id() OR t.business_id IS DISTINCT FROM public.app_current_business_id()
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = t.business_id AND m.user_id = t.requester_user_id) THEN
    RAISE EXCEPTION 'change_request_not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.change_requests (id, ticket_id, business_id, kind, page) VALUES (new_id, t.id, t.business_id, p_kind, p_page);
  RETURN new_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_change_request(uuid, text, text) FROM PUBLIC, bb_app, bb_staff, bb_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_change_request(uuid, text, text) TO bb_app;
--> statement-breakpoint
-- The customer's moves: "decline" a quote (Not now), "approve" a change that is ready, "reopen" within 14 days.
-- Accepting a quote is not here: it opens a charge, which only the server's staff connection can do.
CREATE OR REPLACE FUNCTION public.change_request_customer_move(p_request_id uuid, p_action text)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  r public.change_requests%ROWTYPE;
  target text;
  entered timestamptz;
BEGIN
  SELECT * INTO r FROM public.change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.business_id IS DISTINCT FROM public.app_current_business_id()
     OR NOT EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = r.ticket_id AND t.requester_user_id = public.app_current_user_id())
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = r.business_id AND m.user_id = public.app_current_user_id()) THEN
    RAISE EXCEPTION 'change_request_not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action = 'decline' THEN
    IF r.state <> 'quoted' OR r.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'change_request_wrong_state' USING ERRCODE = 'check_violation'; END IF;
    target := 'withdrawn';
  ELSIF p_action = 'approve' THEN
    IF r.state <> 'preview' THEN RAISE EXCEPTION 'change_request_wrong_state' USING ERRCODE = 'check_violation'; END IF;
    target := 'approved';
  ELSIF p_action = 'reopen' THEN
    IF r.state IN ('approved', 'shipped') THEN
      target := 'revisions';
    ELSIF r.state = 'withdrawn' AND r.coverage = 'paid' THEN
      target := 'quoted';
    ELSE
      RAISE EXCEPTION 'change_request_wrong_state' USING ERRCODE = 'check_violation';
    END IF;
    SELECT max(e.at) INTO entered FROM public.change_request_events e WHERE e.change_request_id = r.id AND e.state = r.state;
    IF entered IS NULL OR entered < now() - interval '14 days' THEN
      RAISE EXCEPTION 'change_request_window_closed' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'change_request_unknown_action' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.change_requests SET state = target WHERE id = r.id;
  RETURN target;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.change_request_customer_move(uuid, text) FROM PUBLIC, bb_app, bb_staff, bb_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.change_request_customer_move(uuid, text) TO bb_app;
--> statement-breakpoint
-- A closed ticket may come back (triaged) only when its change request has been reopened: no other way leaves closed.
CREATE OR REPLACE FUNCTION support_guard_ticket() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.business_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_members WHERE business_id = NEW.business_id AND user_id = NEW.requester_user_id) THEN
      RAISE EXCEPTION 'Support business must belong to the requester';
    END IF;
    IF NEW.status <> 'new' OR NEW.priority <> 'normal' OR NEW.assignee_staff_id IS NOT NULL OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'Support tickets must begin with default workflow state';
    END IF;
  ELSE
    IF OLD.retention_started_at IS NOT NULL THEN RAISE EXCEPTION 'Support ticket is being removed by retention'; END IF;
    IF ROW(NEW.id, NEW.requester_user_id, NEW.business_id, NEW.subject, NEW.display_ref, NEW.submission_key, NEW.submission_hash, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.requester_user_id, OLD.business_id, OLD.subject, OLD.display_ref, OLD.submission_key, OLD.submission_hash, OLD.created_at) THEN
      RAISE EXCEPTION 'Support ticket identity and submission are immutable';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Support ticket version must advance exactly once'; END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'new' AND NEW.status IN ('triaged', 'in_progress', 'waiting_on_you', 'resolved', 'closed')) OR
      (OLD.status = 'triaged' AND NEW.status IN ('in_progress', 'waiting_on_you', 'resolved', 'closed')) OR
      (OLD.status = 'in_progress' AND NEW.status IN ('triaged', 'waiting_on_you', 'resolved', 'closed')) OR
      (OLD.status = 'waiting_on_you' AND NEW.status IN ('triaged', 'in_progress', 'resolved', 'closed')) OR
      (OLD.status = 'resolved' AND NEW.status IN ('triaged', 'in_progress', 'closed')) OR
      (OLD.status = 'closed' AND NEW.status = 'triaged' AND EXISTS (SELECT 1 FROM public.change_requests r WHERE r.ticket_id = NEW.id AND r.state NOT IN ('approved', 'shipped', 'declined', 'withdrawn')))
    ) THEN RAISE EXCEPTION 'Invalid support status transition'; END IF;
  END IF;
  IF NEW.assignee_staff_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_staff_id IS DISTINCT FROM OLD.assignee_staff_id)
     AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.assignee_staff_id AND active) THEN
    RAISE EXCEPTION 'Support assignee must be active staff';
  END IF;
  RETURN NEW;
END $$;
