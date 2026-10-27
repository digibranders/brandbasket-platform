-- Staff may open a request on a customer's behalf (console Requests, plan 50): the ticket's first message is then a
-- public staff message. Only the first-message check changes; the rest of support_record_message is as in 0127.
CREATE OR REPLACE FUNCTION support_record_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t public.support_tickets%ROWTYPE; initial boolean; next_status public.support_status;
BEGIN
  SELECT * INTO STRICT t FROM public.support_tickets WHERE id = NEW.ticket_id FOR UPDATE;
  IF t.retention_started_at IS NOT NULL THEN RAISE EXCEPTION 'Support ticket is being removed by retention'; END IF;
  IF t.status = 'closed' AND (NEW.author_role = 'customer' OR NEW.visibility = 'public') THEN RAISE EXCEPTION 'Support ticket is closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_closures WHERE user_id = NEW.author_user_id AND restored_at IS NULL) THEN RAISE EXCEPTION 'Closing accounts cannot add support messages'; END IF;
  initial := NOT EXISTS (SELECT 1 FROM public.support_messages WHERE ticket_id = NEW.ticket_id AND id <> NEW.id);
  IF initial AND NOT (NEW.author_role = 'customer' OR (NEW.author_role = 'staff' AND NEW.visibility = 'public')) THEN RAISE EXCEPTION 'The first support message must come from the customer, or be a public staff message'; END IF;
  IF initial AND length(btrim(NEW.body)) < 10 THEN RAISE EXCEPTION 'Initial support description must contain at least 10 characters'; END IF;
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
--> statement-breakpoint

REVOKE ALL ON FUNCTION support_record_message() FROM PUBLIC, bb_app, bb_staff, bb_public;
