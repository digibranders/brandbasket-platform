CREATE TYPE "public"."support_attachment_state" AS ENUM('staged', 'attached', 'deleting', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."support_author_role" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."support_category" AS ENUM('bug', 'support', 'feature', 'billing', 'website_change', 'account_access', 'general', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('new', 'triaged', 'in_progress', 'waiting_on_you', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TABLE "support_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"ticket_id" uuid,
	"message_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"state" "support_attachment_state" DEFAULT 'staged' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "support_attachments_association_check" CHECK (("support_attachments"."ticket_id" is null) = ("support_attachments"."message_id" is null) and ("support_attachments"."state" <> 'attached' or "support_attachments"."message_id" is not null) and ("support_attachments"."state" <> 'staged' or "support_attachments"."message_id" is null)),
	CONSTRAINT "support_attachments_size_check" CHECK ("support_attachments"."byte_size" between 1 and 4194304),
	CONSTRAINT "support_attachments_image_check" CHECK ("support_attachments"."mime_type" in ('image/png', 'image/jpeg', 'image/webp') and "support_attachments"."width" is not null and "support_attachments"."height" is not null and "support_attachments"."width" between 1 and 12000 and "support_attachments"."height" between 1 and 12000 and "support_attachments"."width"::bigint * "support_attachments"."height"::bigint <= 16000000),
	CONSTRAINT "support_attachments_hash_check" CHECK ("support_attachments"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_attachments_filename_check" CHECK (length("support_attachments"."filename") between 1 and 255),
	CONSTRAINT "support_attachments_key_check" CHECK ("support_attachments"."storage_key" ~ '^support/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
--> statement-breakpoint
CREATE TABLE "support_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_events_kind_check" CHECK ("support_events"."kind" in ('created', 'message_added', 'updated', 'reopened'))
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"visibility" "support_visibility" DEFAULT 'public' NOT NULL,
	"author_role" "support_author_role" NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"details" jsonb,
	"submission_key" text NOT NULL,
	"submission_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_id_ticket_unique" UNIQUE("id","ticket_id"),
	CONSTRAINT "support_messages_author_submission_unique" UNIQUE("author_user_id","submission_key"),
	CONSTRAINT "support_messages_body_check" CHECK (length(btrim("support_messages"."body")) between 1 and 5000 and "support_messages"."body" = btrim("support_messages"."body")),
	CONSTRAINT "support_messages_customer_public_check" CHECK ("support_messages"."author_role" <> 'customer' or "support_messages"."visibility" = 'public'),
	CONSTRAINT "support_messages_submission_key_check" CHECK ("support_messages"."submission_key" ~ '^[A-Za-z0-9_-]{8,128}$'),
	CONSTRAINT "support_messages_submission_hash_check" CHECK ("support_messages"."submission_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_messages_details_check" CHECK ("support_messages"."details" is null or (jsonb_typeof("support_messages"."details") = 'object' and octet_length("support_messages"."details"::text) <= 8192))
);
--> statement-breakpoint
CREATE TABLE "support_read_states" (
	"ticket_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_read_states_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_ref" text NOT NULL,
	"requester_user_id" text NOT NULL,
	"business_id" uuid,
	"category" "support_category" NOT NULL,
	"subject" text NOT NULL,
	"status" "support_status" DEFAULT 'new' NOT NULL,
	"priority" "support_priority" DEFAULT 'normal' NOT NULL,
	"assignee_staff_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"submission_key" text NOT NULL,
	"submission_hash" text NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_display_ref_unique" UNIQUE("display_ref"),
	CONSTRAINT "support_tickets_requester_submission_unique" UNIQUE("requester_user_id","submission_key"),
	CONSTRAINT "support_tickets_subject_check" CHECK (length(btrim("support_tickets"."subject")) between 3 and 120 and "support_tickets"."subject" = btrim("support_tickets"."subject")),
	CONSTRAINT "support_tickets_version_check" CHECK ("support_tickets"."version" > 0),
	CONSTRAINT "support_tickets_submission_key_check" CHECK ("support_tickets"."submission_key" ~ '^[A-Za-z0-9_-]{8,128}$'),
	CONSTRAINT "support_tickets_submission_hash_check" CHECK ("support_tickets"."submission_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "error_event_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"app" text NOT NULL,
	"operation" text NOT NULL,
	"error_class" text NOT NULL,
	"route" text NOT NULL,
	"release" text NOT NULL,
	"browser" text NOT NULL,
	"severity" text NOT NULL,
	"frames" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assignee_staff_id" text,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"user_bits" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"regression_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "error_issues_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "error_issues_app_check" CHECK ("error_issues"."app" in ('platform', 'admin')),
	CONSTRAINT "error_issues_severity_check" CHECK ("error_issues"."severity" in ('error', 'fatal')),
	CONSTRAINT "error_issues_status_check" CHECK ("error_issues"."status" in ('new', 'investigating', 'resolved', 'ignored')),
	CONSTRAINT "error_issues_counts_check" CHECK ("error_issues"."occurrence_count" >= 0 and "error_issues"."regression_count" >= 0),
	CONSTRAINT "error_issues_user_bits_check" CHECK (length("error_issues"."user_bits") = 1024 and "error_issues"."user_bits" !~ '[^01]'),
	CONSTRAINT "error_issues_fingerprint_check" CHECK ("error_issues"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "error_issues_release_check" CHECK ("error_issues"."release" = 'unknown' or "error_issues"."release" ~ '^[0-9a-f]{7,64}$'),
	CONSTRAINT "error_issues_browser_check" CHECK ("error_issues"."browser" in ('Chrome', 'Safari', 'Firefox', 'Edge', 'Other', 'Server')),
	CONSTRAINT "error_issues_class_check" CHECK ("error_issues"."error_class" in ('Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'DatabaseError', 'DrizzleQueryError', 'UnknownError')),
	CONSTRAINT "error_issues_operation_check" CHECK ("error_issues"."operation" in ('server_render', 'server_action', 'server_route', 'server_proxy', 'browser_uncaught', 'browser_rejection', 'error_boundary', 'support_submit', 'support_attachment', 'billing_checkout', 'billing_payment', 'booking_create')),
	CONSTRAINT "error_issues_frames_check" CHECK (jsonb_typeof("error_issues"."frames") = 'array' and jsonb_array_length("error_issues"."frames") <= 8)
);
--> statement-breakpoint
CREATE TABLE "support_ticket_error_links" (
	"ticket_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"linked_by_staff_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_error_links_ticket_id_issue_id_pk" PRIMARY KEY("ticket_id","issue_id")
);
--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_ticket_fk" FOREIGN KEY ("message_id","ticket_id") REFERENCES "public"."support_messages"("id","ticket_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_read_states" ADD CONSTRAINT "support_read_states_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_read_states" ADD CONSTRAINT "support_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_read_states" ADD CONSTRAINT "support_read_states_message_ticket_fk" FOREIGN KEY ("last_read_message_id","ticket_id") REFERENCES "public"."support_messages"("id","ticket_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_staff_id_staff_members_user_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_issues" ADD CONSTRAINT "error_issues_assignee_staff_id_staff_members_user_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_error_links" ADD CONSTRAINT "support_ticket_error_links_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_error_links" ADD CONSTRAINT "support_ticket_error_links_issue_id_error_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."error_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_error_links" ADD CONSTRAINT "support_ticket_error_links_linked_by_staff_id_staff_members_user_id_fk" FOREIGN KEY ("linked_by_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_attachments_message_idx" ON "support_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "support_attachments_expiry_idx" ON "support_attachments" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "support_events_ticket_idx" ON "support_events" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_id_idx" ON "support_messages" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "support_tickets_requester_id_idx" ON "support_tickets" USING btree ("requester_user_id","id");--> statement-breakpoint
CREATE INDEX "support_tickets_queue_idx" ON "support_tickets" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_activity_idx" ON "support_tickets" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "support_tickets_category_id_idx" ON "support_tickets" USING btree ("category","id");--> statement-breakpoint
CREATE INDEX "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assignee_staff_id","status");--> statement-breakpoint
CREATE INDEX "error_event_receipts_received_idx" ON "error_event_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "error_issues_last_seen_idx" ON "error_issues" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "error_issues_status_idx" ON "error_issues" USING btree ("status");
--> statement-breakpoint
-- Append after the generated support table DDL. No public marketing role can access support data.
REVOKE ALL ON support_tickets, support_messages, support_attachments, support_events, support_read_states FROM PUBLIC, webfold_public;
GRANT SELECT, INSERT ON support_tickets, support_messages TO webfold_app;
GRANT SELECT, INSERT ON support_attachments TO webfold_app;
GRANT UPDATE (ticket_id, message_id, state, updated_at) ON support_attachments TO webfold_app;
GRANT SELECT, INSERT, UPDATE ON support_read_states TO webfold_app;
GRANT SELECT, INSERT, UPDATE ON support_tickets, support_attachments, support_read_states TO webfold_staff;
GRANT SELECT, INSERT ON support_messages, support_events TO webfold_staff;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_read_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_customer_read ON support_tickets FOR SELECT TO webfold_app USING (requester_user_id = app_current_user_id());
CREATE POLICY support_tickets_customer_insert ON support_tickets FOR INSERT TO webfold_app WITH CHECK (
  requester_user_id = app_current_user_id() AND status = 'new' AND priority = 'normal' AND assignee_staff_id IS NULL AND version = 1
  AND (business_id IS NULL OR EXISTS (SELECT 1 FROM business_members m WHERE m.business_id = support_tickets.business_id AND m.user_id = app_current_user_id()))
);
CREATE POLICY support_tickets_staff ON support_tickets FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY support_messages_customer_read ON support_messages FOR SELECT TO webfold_app USING (
  visibility = 'public' AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
);
CREATE POLICY support_messages_customer_insert ON support_messages FOR INSERT TO webfold_app WITH CHECK (
  visibility = 'public' AND author_role = 'customer' AND author_user_id = app_current_user_id()
  AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id() AND t.status <> 'closed')
);
CREATE POLICY support_messages_staff ON support_messages FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY support_attachments_customer_read ON support_attachments FOR SELECT TO webfold_app USING (
  (message_id IS NULL AND uploaded_by_user_id = app_current_user_id() AND state IN ('staged', 'deleting'))
  OR (state = 'attached' AND EXISTS (SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE m.id = message_id AND m.ticket_id = support_attachments.ticket_id AND m.visibility = 'public' AND t.requester_user_id = app_current_user_id()))
);
CREATE POLICY support_attachments_customer_insert ON support_attachments FOR INSERT TO webfold_app WITH CHECK (
  uploaded_by_user_id = app_current_user_id() AND state = 'staged' AND ticket_id IS NULL AND message_id IS NULL
);
CREATE POLICY support_attachments_customer_update ON support_attachments FOR UPDATE TO webfold_app USING (
  uploaded_by_user_id = app_current_user_id() AND message_id IS NULL AND state IN ('staged', 'deleting')
) WITH CHECK (
  uploaded_by_user_id = app_current_user_id() AND (
    (message_id IS NULL AND ticket_id IS NULL AND state = 'deleting')
    OR (state = 'attached' AND EXISTS (SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE m.id = message_id AND m.ticket_id = support_attachments.ticket_id AND m.author_user_id = app_current_user_id() AND m.author_role = 'customer' AND m.visibility = 'public' AND t.requester_user_id = app_current_user_id()))
  )
);
CREATE POLICY support_attachments_staff ON support_attachments FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY support_events_staff ON support_events FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY support_read_states_customer ON support_read_states FOR ALL TO webfold_app USING (
  user_id = app_current_user_id() AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
) WITH CHECK (
  user_id = app_current_user_id() AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
);
CREATE POLICY support_read_states_staff ON support_read_states FOR ALL TO webfold_staff USING (true) WITH CHECK (true);

-- Ticket authorization never relies on nullable tenant scope. Verify an optional business against requester membership.
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
      (OLD.status = 'resolved' AND NEW.status IN ('triaged', 'in_progress', 'closed'))
    ) THEN RAISE EXCEPTION 'Invalid support status transition'; END IF;
  END IF;
  IF NEW.assignee_staff_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_staff_id IS DISTINCT FROM OLD.assignee_staff_id)
     AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.assignee_staff_id AND active) THEN
    RAISE EXCEPTION 'Support assignee must be active staff';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_ticket_guard BEFORE INSERT OR UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION support_guard_ticket();
REVOKE ALL ON FUNCTION support_guard_ticket() FROM PUBLIC, webfold_app, webfold_staff, webfold_public;

-- Invoker identity guard: staff cannot publish as another staff member, and customers cannot write internal notes.
CREATE OR REPLACE FUNCTION support_guard_message_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.author_user_id IS DISTINCT FROM public.app_current_user_id() THEN RAISE EXCEPTION 'Support message author must match the current user'; END IF;
  IF current_user = 'webfold_app' AND (NEW.author_role <> 'customer' OR NEW.visibility <> 'public') THEN
    RAISE EXCEPTION 'Customers may add only public customer replies';
  END IF;
  IF current_user = 'webfold_staff' AND NEW.author_role <> 'staff' THEN RAISE EXCEPTION 'Staff must write as staff'; END IF;
  IF NEW.author_role = 'staff' THEN
    IF current_user <> 'webfold_staff' OR NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.author_user_id AND active) THEN
      RAISE EXCEPTION 'Support staff messages require an active staff author';
    END IF;
  END IF;
  IF NEW.author_role = 'customer' AND NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = NEW.ticket_id AND requester_user_id = NEW.author_user_id) THEN
    RAISE EXCEPTION 'Support customer author must own the ticket';
  END IF;
  IF NEW.details IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_each(NEW.details) d WHERE jsonb_typeof(d.value) <> 'string' OR d.key NOT IN ('pageUrl', 'stepsToReproduce', 'expectedBehavior', 'actualBehavior', 'browserDevice', 'invoiceReference', 'requestedChange', 'accountEmail')
      OR length(d.value #>> '{}') > CASE d.key WHEN 'pageUrl' THEN 2048 WHEN 'browserDevice' THEN 200 WHEN 'invoiceReference' THEN 200 WHEN 'accountEmail' THEN 254 ELSE 2000 END
  ) THEN RAISE EXCEPTION 'Invalid structured support details'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_message_identity_guard BEFORE INSERT ON support_messages FOR EACH ROW EXECUTE FUNCTION support_guard_message_identity();

-- Only this definer trigger may update ticket workflow on the customer role's behalf. It cannot be called directly.
-- Its fixed search_path and fully-qualified tables keep caller-controlled names out of privileged work.
CREATE OR REPLACE FUNCTION support_record_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t public.support_tickets%ROWTYPE; initial boolean; next_status public.support_status;
BEGIN
  SELECT * INTO STRICT t FROM public.support_tickets WHERE id = NEW.ticket_id FOR UPDATE;
  IF t.retention_started_at IS NOT NULL THEN RAISE EXCEPTION 'Support ticket is being removed by retention'; END IF;
  IF t.status = 'closed' AND (NEW.author_role = 'customer' OR NEW.visibility = 'public') THEN RAISE EXCEPTION 'Support ticket is closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_closures WHERE user_id = NEW.author_user_id AND restored_at IS NULL) THEN RAISE EXCEPTION 'Closing accounts cannot add support messages'; END IF;
  initial := NOT EXISTS (SELECT 1 FROM public.support_messages WHERE ticket_id = NEW.ticket_id AND id <> NEW.id);
  IF initial AND (NEW.author_role <> 'customer' OR length(btrim(NEW.body)) < 10) THEN RAISE EXCEPTION 'Initial support description must contain at least 10 characters'; END IF;
  IF NOT initial AND NEW.details IS NOT NULL THEN RAISE EXCEPTION 'Structured support details belong only to the initial message'; END IF;
  next_status := CASE WHEN NEW.author_role = 'customer' AND t.status IN ('waiting_on_you', 'resolved') THEN 'triaged'::public.support_status ELSE t.status END;
  UPDATE public.support_tickets SET status = next_status, version = version + 1, last_activity_at = CASE WHEN NEW.visibility = 'public' THEN clock_timestamp() ELSE last_activity_at END, updated_at = clock_timestamp() WHERE id = NEW.ticket_id;
  INSERT INTO public.support_events (id, ticket_id, actor_user_id, kind, data)
    VALUES (gen_random_uuid(), NEW.ticket_id, NEW.author_user_id, CASE WHEN initial THEN 'created' ELSE 'message_added' END, jsonb_build_object('messageId', NEW.id::text, 'visibility', NEW.visibility::text));
  IF next_status <> t.status THEN
    INSERT INTO public.support_events (id, ticket_id, actor_user_id, kind, data) VALUES (gen_random_uuid(), NEW.ticket_id, NEW.author_user_id, 'reopened', jsonb_build_object('previousStatus', t.status::text, 'status', next_status::text));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_message_record AFTER INSERT ON support_messages FOR EACH ROW EXECUTE FUNCTION support_record_message();
REVOKE ALL ON FUNCTION support_record_message() FROM PUBLIC, webfold_app, webfold_staff, webfold_public;

CREATE OR REPLACE FUNCTION support_guard_attachment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE author_id text; attachment_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.uploaded_by_user_id IS DISTINCT FROM public.app_current_user_id() THEN RAISE EXCEPTION 'Support upload owner must match the current user'; END IF;
    IF NEW.state <> 'staged' OR NEW.message_id IS NOT NULL OR NEW.ticket_id IS NOT NULL THEN RAISE EXCEPTION 'Support uploads must be staged first'; END IF;
    IF NEW.expires_at <= clock_timestamp() OR NEW.expires_at > clock_timestamp() + interval '24 hours' THEN RAISE EXCEPTION 'Invalid support upload expiry'; END IF;
    IF EXISTS (SELECT 1 FROM public.account_closures WHERE user_id = NEW.uploaded_by_user_id AND restored_at IS NULL) THEN RAISE EXCEPTION 'Closing accounts cannot upload support attachments'; END IF;
  ELSE
    IF ROW(NEW.id, NEW.uploaded_by_user_id, NEW.storage_key, NEW.filename, NEW.mime_type, NEW.byte_size, NEW.width, NEW.height, NEW.sha256, NEW.expires_at, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.uploaded_by_user_id, OLD.storage_key, OLD.filename, OLD.mime_type, OLD.byte_size, OLD.width, OLD.height, OLD.sha256, OLD.expires_at, OLD.created_at) THEN RAISE EXCEPTION 'Support upload metadata is immutable'; END IF;
    IF NEW.state <> OLD.state AND NOT ((OLD.state = 'staged' AND NEW.state IN ('attached', 'deleting')) OR (OLD.state = 'attached' AND NEW.state = 'deleting') OR (OLD.state = 'deleting' AND NEW.state = 'deleted')) THEN RAISE EXCEPTION 'Invalid support attachment lifecycle'; END IF;
    IF OLD.state = 'attached' AND ROW(NEW.ticket_id, NEW.message_id) IS DISTINCT FROM ROW(OLD.ticket_id, OLD.message_id) THEN RAISE EXCEPTION 'Support attachments cannot move between messages'; END IF;
    IF NEW.state = 'attached' AND OLD.state = 'staged' THEN
      IF OLD.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Support attachment has expired'; END IF;
      -- Lock the parent message before counting, so concurrent claims cannot exceed three screenshots.
      SELECT author_user_id INTO STRICT author_id FROM public.support_messages WHERE id = NEW.message_id AND ticket_id = NEW.ticket_id FOR UPDATE;
      IF author_id <> NEW.uploaded_by_user_id THEN RAISE EXCEPTION 'Support attachment uploader must be the message author'; END IF;
      SELECT count(*) INTO attachment_count FROM public.support_attachments WHERE message_id = NEW.message_id AND state = 'attached' AND id <> NEW.id;
      IF attachment_count >= 3 THEN RAISE EXCEPTION 'A support message accepts at most three attachments'; END IF;
    ELSIF ROW(NEW.ticket_id, NEW.message_id) IS DISTINCT FROM ROW(OLD.ticket_id, OLD.message_id) THEN
      RAISE EXCEPTION 'Only staged attachment claims may change association';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_attachment_guard BEFORE INSERT OR UPDATE ON support_attachments FOR EACH ROW EXECUTE FUNCTION support_guard_attachment();
REVOKE ALL ON FUNCTION support_guard_attachment() FROM PUBLIC, webfold_app, webfold_staff, webfold_public;

CREATE OR REPLACE FUNCTION support_guard_read_state() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM public.app_current_user_id() OR NOT EXISTS (
    SELECT 1 FROM public.support_messages m JOIN public.support_tickets t ON t.id = m.ticket_id
    WHERE m.id = NEW.last_read_message_id AND m.ticket_id = NEW.ticket_id AND m.visibility = 'public' AND t.requester_user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'Support read cursor must reference an owned public message'; END IF;
  IF TG_OP = 'UPDATE' AND (ROW(NEW.user_id, NEW.ticket_id) IS DISTINCT FROM ROW(OLD.user_id, OLD.ticket_id) OR NEW.last_read_message_id < OLD.last_read_message_id) THEN RAISE EXCEPTION 'Support read cursors cannot move backwards or change owner'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_read_state_guard BEFORE INSERT OR UPDATE ON support_read_states FOR EACH ROW EXECUTE FUNCTION support_guard_read_state();

-- Append-only messages and events: grants already deny updates/deletes; triggers also protect privileged accidental writes.
CREATE OR REPLACE FUNCTION support_deny_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Support history is append-only'; END $$;
CREATE TRIGGER support_message_history_guard BEFORE UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION support_deny_history_mutation();
CREATE TRIGGER support_event_history_guard BEFORE UPDATE OR DELETE ON support_events FOR EACH ROW EXECUTE FUNCTION support_deny_history_mutation();

-- Staff erasure runs only for an account already entering its closure flow, after private objects are removed.
-- The transaction-local flag is checked together with the definer's owner role by the history trigger.
CREATE OR REPLACE FUNCTION support_deny_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user NOT IN ('webfold_app', 'webfold_staff', 'webfold_public')
     AND (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = OLD.ticket_id AND t.requester_user_id = nullif(current_setting('support.erase_user', true), ''))
       OR OLD.ticket_id::text = nullif(current_setting('support.purge_ticket', true), '')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Support history is append-only';
END $$;

CREATE OR REPLACE FUNCTION erase_support_data_for_user(target_user_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF target_user_id IS NULL OR btrim(target_user_id) = '' THEN RAISE EXCEPTION 'Support erasure requires a user ID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support-user:' || target_user_id, 0));
  IF NOT EXISTS (SELECT 1 FROM public.account_closures WHERE user_id = target_user_id AND restored_at IS NULL AND erased_at IS NULL) THEN RAISE EXCEPTION 'Support erasure requires an open account closure'; END IF;
  IF EXISTS (SELECT 1 FROM public.support_attachments a WHERE (a.uploaded_by_user_id = target_user_id OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = a.ticket_id AND t.requester_user_id = target_user_id)) AND a.state <> 'deleted') THEN
    RAISE EXCEPTION 'Support objects must be purged before erasing support data';
  END IF;
  PERFORM set_config('support.erase_user', target_user_id, true);
  DELETE FROM public.support_attachments a WHERE a.uploaded_by_user_id = target_user_id OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = a.ticket_id AND t.requester_user_id = target_user_id);
  DELETE FROM public.support_read_states r WHERE r.user_id = target_user_id OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = r.ticket_id AND t.requester_user_id = target_user_id);
  DELETE FROM public.support_ticket_error_links l WHERE EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = l.ticket_id AND t.requester_user_id = target_user_id);
  DELETE FROM public.support_events e WHERE EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = e.ticket_id AND t.requester_user_id = target_user_id);
  DELETE FROM public.support_messages m WHERE EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = m.ticket_id AND t.requester_user_id = target_user_id);
  DELETE FROM public.support_tickets WHERE requester_user_id = target_user_id;
  PERFORM set_config('support.erase_user', '', true);
END $$;
REVOKE ALL ON FUNCTION erase_support_data_for_user(text) FROM PUBLIC, webfold_app, webfold_public;
GRANT EXECUTE ON FUNCTION erase_support_data_for_user(text) TO webfold_staff;

CREATE OR REPLACE FUNCTION purge_retained_support_ticket(target_ticket_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = target_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF t.retention_started_at IS NULL OR t.status <> 'closed' THEN RAISE EXCEPTION 'Support ticket has not been claimed for retention'; END IF;
  IF EXISTS (SELECT 1 FROM public.support_attachments WHERE ticket_id = target_ticket_id AND state <> 'deleted') THEN RAISE EXCEPTION 'Support objects must be purged before retaining ticket metadata'; END IF;
  PERFORM set_config('support.purge_ticket', target_ticket_id::text, true);
  DELETE FROM public.support_attachments WHERE ticket_id = target_ticket_id;
  DELETE FROM public.support_read_states WHERE ticket_id = target_ticket_id;
  DELETE FROM public.support_ticket_error_links WHERE ticket_id = target_ticket_id;
  DELETE FROM public.support_events WHERE ticket_id = target_ticket_id;
  DELETE FROM public.support_messages WHERE ticket_id = target_ticket_id;
  DELETE FROM public.support_tickets WHERE id = target_ticket_id;
  PERFORM set_config('support.purge_ticket', '', true);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION purge_retained_support_ticket(uuid) FROM PUBLIC, webfold_app, webfold_public;
GRANT EXECUTE ON FUNCTION purge_retained_support_ticket(uuid) TO webfold_staff;
--> statement-breakpoint
ALTER TABLE public.error_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_error_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.error_issues, public.error_event_receipts, public.support_ticket_error_links FROM PUBLIC, webfold_app, webfold_public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_issues, public.error_event_receipts, public.support_ticket_error_links TO webfold_staff;
CREATE POLICY error_issues_staff ON public.error_issues FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY error_receipts_staff ON public.error_event_receipts FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
CREATE POLICY support_error_links_staff ON public.support_ticket_error_links FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
