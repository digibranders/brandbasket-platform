-- Customer app v4 (plan 61 section 6): privileges and row-level security for the tables 0215 added, and the viewer role.
--
-- Until now no policy read business_members.role: every customer policy trusts app.business_id, which the app sets only
-- after it has checked the membership. A viewer is a member, so those policies would let a viewer write. This migration
-- keeps every existing policy and adds RESTRICTIVE ones beside them that refuse a write when the signed-in user is a
-- viewer of the scoped business. No viewer exists before this release, so nothing that works today changes.

-- The signed-in user's role in the scoped business, or null when either is unset or they are not a member. It runs
-- as the caller: business_members_own_rows lets bb_app read its own membership rows, and staff read every row.
CREATE FUNCTION public.app_current_member_role() RETURNS text
  LANGUAGE sql STABLE
  SET search_path TO 'pg_catalog', 'public'
  AS $$
    SELECT m.role::text FROM public.business_members m
    WHERE m.business_id = public.app_current_business_id() AND m.user_id = public.app_current_user_id()
  $$;
--> statement-breakpoint

-- enquiries: staff and jobs write on the staff connection; the customer reads their own and changes status and note.
GRANT SELECT ON enquiries TO bb_app;
--> statement-breakpoint
GRANT UPDATE (status, note, updated_at) ON enquiries TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON enquiries TO bb_staff;
--> statement-breakpoint
-- Identity and origin columns only: the customer's status and note are theirs.
GRANT UPDATE (source, name, phone, email, message, updated_at) ON enquiries TO bb_staff;
--> statement-breakpoint
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY enquiries_tenant_select ON enquiries FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY enquiries_tenant_update ON enquiries FOR UPDATE TO bb_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY enquiries_staff_all ON enquiries FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- website_pages: the nightly sitemap sync writes on the staff connection; the customer reads their own.
GRANT SELECT ON website_pages TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON website_pages TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (title, last_seen_at) ON website_pages TO bb_staff;
--> statement-breakpoint
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY website_pages_tenant_select ON website_pages FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY website_pages_staff_all ON website_pages FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- connected_accounts: staff maintained; the customer reads their own.
GRANT SELECT ON connected_accounts TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON connected_accounts TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (handle, url, status, checked_at, updated_at) ON connected_accounts TO bb_staff;
--> statement-breakpoint
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY connected_accounts_tenant_select ON connected_accounts FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY connected_accounts_staff_all ON connected_accounts FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- notification_preferences and notification_reads: each person manages their own rows, for a business they belong
-- to (any role, viewers included). Staff read preferences before sending mail and delete both on erasure.
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences, notification_reads TO bb_app;
--> statement-breakpoint
GRANT SELECT, DELETE ON notification_preferences, notification_reads TO bb_staff;
--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_preferences_own ON notification_preferences FOR ALL TO bb_app
  USING (user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL)
  WITH CHECK (user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY notification_preferences_staff_all ON notification_preferences FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY notification_reads_own ON notification_reads FOR ALL TO bb_app
  USING (user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL)
  WITH CHECK (user_id = app_current_user_id() AND business_id = app_current_business_id() AND app_current_member_role() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY notification_reads_staff_all ON notification_reads FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- business_invites: the business's owner lists, creates and revokes its invites. Editors and viewers see none.
-- Accepting adds a business_members row, which only the staff connection may write, so it runs there
-- (acceptBusinessInvite), after the token, the expiry and the signed-in address are checked.
GRANT SELECT, INSERT ON business_invites TO bb_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON business_invites TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON business_invites TO bb_staff;
--> statement-breakpoint
ALTER TABLE business_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY business_invites_owner_select ON business_invites FOR SELECT TO bb_app
  USING (business_id = app_current_business_id() AND app_current_member_role() = 'owner');
--> statement-breakpoint
CREATE POLICY business_invites_owner_insert ON business_invites FOR INSERT TO bb_app
  WITH CHECK (
    business_id = app_current_business_id() AND app_current_member_role() = 'owner'
    AND invited_by = app_current_user_id() AND accepted_at IS NULL AND revoked_at IS NULL
  );
--> statement-breakpoint
-- Only an open invite can be revoked; an accepted one is a membership now.
CREATE POLICY business_invites_owner_revoke ON business_invites FOR UPDATE TO bb_app
  USING (business_id = app_current_business_id() AND app_current_member_role() = 'owner' AND accepted_at IS NULL)
  WITH CHECK (business_id = app_current_business_id() AND app_current_member_role() = 'owner');
--> statement-breakpoint
CREATE POLICY business_invites_staff_all ON business_invites FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- deliverables: staff write the two new columns like the others (named columns only, see 0193).
GRANT UPDATE (format, channel) ON deliverables TO bb_staff;
--> statement-breakpoint

-- A viewer writes no business data. One RESTRICTIVE policy per command on every business table bb_app can write, so
-- a viewer's INSERT is refused and their UPDATE or DELETE touches no row. Personal rows (users, sessions, accounts,
-- user_privacy_settings, notification_preferences, notification_reads, support_read_states) stay theirs to change.
-- A write with no business in scope, or by someone who is not a member (staff acting as the customer), is unaffected.
DO $$
DECLARE
  t text;
  cmd text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointment_services', 'appointment_settings', 'appointments', 'billing_profiles', 'business_announcements',
    'business_closures', 'business_hours', 'business_profiles', 'chatbots', 'client_intakes', 'directory_promotions',
    'domains', 'enquiries', 'listing_content', 'media_assets', 'onboarding_progress', 'patients', 'practitioner_hours',
    'practitioner_leave', 'practitioners', 'project_briefs', 'projects', 'service_setup', 'services',
    'setup_call_bookings', 'support_attachments', 'support_messages', 'support_tickets', 'team_calls'
  ] LOOP
    FOREACH cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      EXECUTE format(
        'CREATE POLICY %I ON %I AS RESTRICTIVE FOR %s TO bb_app %s',
        t || '_no_viewer_' || cmd,
        t,
        upper(cmd),
        CASE cmd
          WHEN 'insert' THEN $c$WITH CHECK (app_current_member_role() IS DISTINCT FROM 'viewer')$c$
          WHEN 'update' THEN $c$USING (app_current_member_role() IS DISTINCT FROM 'viewer') WITH CHECK (app_current_member_role() IS DISTINCT FROM 'viewer')$c$
          ELSE $c$USING (app_current_member_role() IS DISTINCT FROM 'viewer')$c$
        END
      );
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint

-- The customer's three SECURITY DEFINER writes skip row-level security, so each checks the role itself: the membership
-- test each already makes now also requires a role other than viewer. The rest of each body is unchanged.
CREATE OR REPLACE FUNCTION public.approve_deliverables(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  approved integer;
BEGIN
  IF public.app_current_user_id() IS NULL OR public.app_current_business_id() IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = public.app_current_business_id() AND m.user_id = public.app_current_user_id() AND m.role <> 'viewer') THEN
    RAISE EXCEPTION 'deliverable_not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 50 THEN
    RAISE EXCEPTION 'deliverable_bad_request' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.deliverables
     SET status = 'approved', approved_at = now(), approved_by_user_id = public.app_current_user_id(), updated_at = now()
   WHERE id = ANY (p_ids) AND business_id = public.app_current_business_id() AND kind = 'post' AND status = 'awaiting_approval';
  GET DIAGNOSTICS approved = ROW_COUNT;
  RETURN approved;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.change_request_customer_move(p_request_id uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r public.change_requests%ROWTYPE;
  target text;
  entered timestamptz;
BEGIN
  SELECT * INTO r FROM public.change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.business_id IS DISTINCT FROM public.app_current_business_id()
     OR NOT EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = r.ticket_id AND t.requester_user_id = public.app_current_user_id())
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = r.business_id AND m.user_id = public.app_current_user_id() AND m.role <> 'viewer') THEN
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
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_change_request(p_ticket_id uuid, p_kind text, p_page text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  t public.support_tickets%ROWTYPE;
  new_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = p_ticket_id;
  -- Only a ticket made a moment ago ('new') takes a request, so an old closed ticket cannot be pulled back into the queue.
  IF NOT FOUND OR t.status <> 'new' OR t.requester_user_id IS DISTINCT FROM public.app_current_user_id() OR t.business_id IS DISTINCT FROM public.app_current_business_id()
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = t.business_id AND m.user_id = t.requester_user_id AND m.role <> 'viewer') THEN
    RAISE EXCEPTION 'change_request_not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.change_requests (id, ticket_id, business_id, kind, page) VALUES (new_id, t.id, t.business_id, p_kind, p_page);
  RETURN new_id;
END
$function$;
