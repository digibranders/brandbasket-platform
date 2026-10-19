-- Append after the generated support table DDL. No public marketing role can access support data.
REVOKE ALL ON support_tickets, support_messages, support_attachments, support_events, support_read_states FROM PUBLIC, bb_public, bb_public;
GRANT SELECT, INSERT ON support_tickets, support_messages TO bb_app, bb_app;
GRANT SELECT, INSERT ON support_attachments TO bb_app, bb_app;
GRANT UPDATE (ticket_id, message_id, state, updated_at) ON support_attachments TO bb_app, bb_app;
GRANT SELECT, INSERT, UPDATE ON support_read_states TO bb_app, bb_app;
GRANT SELECT, INSERT, UPDATE ON support_tickets, support_attachments, support_read_states TO bb_staff, bb_staff;
GRANT SELECT, INSERT ON support_messages, support_events TO bb_staff, bb_staff;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_read_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_customer_read ON support_tickets FOR SELECT TO bb_app, bb_app USING (requester_user_id = app_current_user_id());
CREATE POLICY support_tickets_customer_insert ON support_tickets FOR INSERT TO bb_app, bb_app WITH CHECK (
  requester_user_id = app_current_user_id() AND status = 'new' AND priority = 'normal' AND assignee_staff_id IS NULL AND version = 1
  AND (business_id IS NULL OR EXISTS (SELECT 1 FROM business_members m WHERE m.business_id = support_tickets.business_id AND m.user_id = app_current_user_id()))
);
CREATE POLICY support_tickets_staff ON support_tickets FOR ALL TO bb_staff, bb_staff USING (true) WITH CHECK (true);
CREATE POLICY support_messages_customer_read ON support_messages FOR SELECT TO bb_app, bb_app USING (
  visibility = 'public' AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
);
CREATE POLICY support_messages_customer_insert ON support_messages FOR INSERT TO bb_app, bb_app WITH CHECK (
  visibility = 'public' AND author_role = 'customer' AND author_user_id = app_current_user_id()
  AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id() AND t.status <> 'closed')
);
CREATE POLICY support_messages_staff ON support_messages FOR ALL TO bb_staff, bb_staff USING (true) WITH CHECK (true);
CREATE POLICY support_attachments_customer_read ON support_attachments FOR SELECT TO bb_app, bb_app USING (
  (message_id IS NULL AND uploaded_by_user_id = app_current_user_id() AND state IN ('staged', 'deleting'))
  OR (state = 'attached' AND EXISTS (SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE m.id = message_id AND m.ticket_id = support_attachments.ticket_id AND m.visibility = 'public' AND t.requester_user_id = app_current_user_id()))
);
CREATE POLICY support_attachments_customer_insert ON support_attachments FOR INSERT TO bb_app, bb_app WITH CHECK (
  uploaded_by_user_id = app_current_user_id() AND state = 'staged' AND ticket_id IS NULL AND message_id IS NULL
);
CREATE POLICY support_attachments_customer_update ON support_attachments FOR UPDATE TO bb_app, bb_app USING (
  uploaded_by_user_id = app_current_user_id() AND message_id IS NULL AND state IN ('staged', 'deleting')
) WITH CHECK (
  uploaded_by_user_id = app_current_user_id() AND (
    (message_id IS NULL AND ticket_id IS NULL AND state = 'deleting')
    OR (state = 'attached' AND EXISTS (SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE m.id = message_id AND m.ticket_id = support_attachments.ticket_id AND m.author_user_id = app_current_user_id() AND m.author_role = 'customer' AND m.visibility = 'public' AND t.requester_user_id = app_current_user_id()))
  )
);
CREATE POLICY support_attachments_staff ON support_attachments FOR ALL TO bb_staff, bb_staff USING (true) WITH CHECK (true);
CREATE POLICY support_events_staff ON support_events FOR ALL TO bb_staff, bb_staff USING (true) WITH CHECK (true);
CREATE POLICY support_read_states_customer ON support_read_states FOR ALL TO bb_app, bb_app USING (
  user_id = app_current_user_id() AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
) WITH CHECK (
  user_id = app_current_user_id() AND EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.requester_user_id = app_current_user_id())
);
CREATE POLICY support_read_states_staff ON support_read_states FOR ALL TO bb_staff, bb_staff USING (true) WITH CHECK (true);

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
REVOKE ALL ON FUNCTION support_guard_ticket() FROM PUBLIC, bb_app, bb_staff, bb_public, bb_app, bb_staff, bb_public;

-- Invoker identity guard: staff cannot publish as another staff member, and customers cannot write internal notes.
CREATE OR REPLACE FUNCTION support_guard_message_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.author_user_id IS DISTINCT FROM public.app_current_user_id() THEN RAISE EXCEPTION 'Support message author must match the current user'; END IF;
  IF current_user IN ('bb_app', 'bb_app') AND (NEW.author_role <> 'customer' OR NEW.visibility <> 'public') THEN
    RAISE EXCEPTION 'Customers may add only public customer replies';
  END IF;
  IF current_user IN ('bb_staff', 'bb_staff') AND NEW.author_role <> 'staff' THEN RAISE EXCEPTION 'Staff must write as staff'; END IF;
  IF NEW.author_role = 'staff' THEN
    IF current_user NOT IN ('bb_staff', 'bb_staff') OR NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.author_user_id AND active) THEN
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
REVOKE ALL ON FUNCTION support_record_message() FROM PUBLIC, bb_app, bb_staff, bb_public, bb_app, bb_staff, bb_public;

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
REVOKE ALL ON FUNCTION support_guard_attachment() FROM PUBLIC, bb_app, bb_staff, bb_public, bb_app, bb_staff, bb_public;

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
-- Staff erasure runs only for an account already entering its closure flow, after private objects are removed.
-- The transaction-local flag is checked together with the definer's owner role by the history trigger.
CREATE OR REPLACE FUNCTION support_deny_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user NOT IN ('bb_app', 'bb_staff', 'bb_public', 'bb_app', 'bb_staff', 'bb_public')
     AND (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = OLD.ticket_id AND t.requester_user_id = nullif(current_setting('support.erase_user', true), ''))
       OR OLD.ticket_id::text = nullif(current_setting('support.purge_ticket', true), '')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Support history is append-only';
END $$;
CREATE TRIGGER support_message_history_guard BEFORE UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION support_deny_history_mutation();
CREATE TRIGGER support_event_history_guard BEFORE UPDATE OR DELETE ON support_events FOR EACH ROW EXECUTE FUNCTION support_deny_history_mutation();

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
REVOKE ALL ON FUNCTION erase_support_data_for_user(text) FROM PUBLIC, bb_app, bb_public, bb_app, bb_public;
GRANT EXECUTE ON FUNCTION erase_support_data_for_user(text) TO bb_staff, bb_staff;

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
REVOKE ALL ON FUNCTION purge_retained_support_ticket(uuid) FROM PUBLIC, bb_app, bb_public, bb_app, bb_public;
GRANT EXECUTE ON FUNCTION purge_retained_support_ticket(uuid) TO bb_staff, bb_staff;
