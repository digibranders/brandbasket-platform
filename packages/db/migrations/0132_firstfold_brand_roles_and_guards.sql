DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'firstfold_app') THEN
    CREATE ROLE firstfold_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'firstfold_staff') THEN
    CREATE ROLE firstfold_staff LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'firstfold_public') THEN
    CREATE ROLE firstfold_public LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
ALTER ROLE firstfold_staff NOINHERIT;
--> statement-breakpoint
-- Existing runtime connections may still log in as webfold_staff during the rollout.
GRANT firstfold_app TO firstfold_staff, webfold_staff;
--> statement-breakpoint

DO $$
DECLARE
  r record;
BEGIN
  -- Replicate table grants from webfold_* to firstfold_*
  FOR r IN
    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'webfold_app' AND table_schema = 'public'
  LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO firstfold_app', r.privilege_type, r.table_schema, r.table_name);
  END LOOP;

  FOR r IN
    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'webfold_staff' AND table_schema = 'public'
  LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO firstfold_staff', r.privilege_type, r.table_schema, r.table_name);
  END LOOP;

  FOR r IN
    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'webfold_public' AND table_schema = 'public'
  LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO firstfold_public', r.privilege_type, r.table_schema, r.table_name);
  END LOOP;

  -- Replicate column-level grants
  FOR r IN
    SELECT table_schema, table_name, column_name, privilege_type, grantee
    FROM information_schema.column_privileges
    WHERE grantee IN ('webfold_app', 'webfold_staff', 'webfold_public')
      AND table_schema = 'public'
  LOOP
    IF r.grantee = 'webfold_app' THEN
      EXECUTE format('GRANT %s (%I) ON TABLE %I.%I TO firstfold_app', r.privilege_type, r.column_name, r.table_schema, r.table_name);
    ELSIF r.grantee = 'webfold_staff' THEN
      EXECUTE format('GRANT %s (%I) ON TABLE %I.%I TO firstfold_staff', r.privilege_type, r.column_name, r.table_schema, r.table_name);
    ELSIF r.grantee = 'webfold_public' THEN
      EXECUTE format('GRANT %s (%I) ON TABLE %I.%I TO firstfold_public', r.privilege_type, r.column_name, r.table_schema, r.table_name);
    END IF;
  END LOOP;

  -- Replicate sequence grants
  FOR r IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO firstfold_app, firstfold_staff', r.sequence_schema, r.sequence_name);
  END LOOP;

  -- Replicate routine execution grants
  GRANT EXECUTE ON FUNCTION app_module_enabled(uuid, business_module) TO firstfold_app, firstfold_staff;
  GRANT EXECUTE ON FUNCTION erase_support_data_for_user(text) TO firstfold_staff;
  GRANT EXECUTE ON FUNCTION purge_retained_support_ticket(uuid) TO firstfold_staff;
END $$;
--> statement-breakpoint

DO $$
DECLARE
  p record;
  roles_list text[];
  new_roles text;
BEGIN
  -- Add firstfold_* roles to all RLS policies matching webfold_*
  FOR p IN 
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies 
    WHERE schemaname = 'public'
      AND ('webfold_app' = ANY(roles) OR 'webfold_staff' = ANY(roles) OR 'webfold_public' = ANY(roles))
  LOOP
    roles_list := p.roles;
    IF 'webfold_app' = ANY(p.roles) AND NOT ('firstfold_app' = ANY(roles_list)) THEN
      roles_list := array_append(roles_list, 'firstfold_app');
    END IF;
    IF 'webfold_staff' = ANY(p.roles) AND NOT ('firstfold_staff' = ANY(roles_list)) THEN
      roles_list := array_append(roles_list, 'firstfold_staff');
    END IF;
    IF 'webfold_public' = ANY(p.roles) AND NOT ('firstfold_public' = ANY(roles_list)) THEN
      roles_list := array_append(roles_list, 'firstfold_public');
    END IF;
    new_roles := array_to_string(roles_list, ', ');
    EXECUTE format('ALTER POLICY %I ON %I.%I TO %s', p.policyname, p.schemaname, p.tablename, new_roles);
  END LOOP;
END $$;
--> statement-breakpoint

-- 1. projects_guard_customer_transition
CREATE OR REPLACE FUNCTION public.projects_guard_customer_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF current_user IN ('firstfold_app', 'webfold_app') AND NOT (OLD.status = 'onboarding' AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION '% may only move a project from onboarding to submitted', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 2. domains_guard_customer_insert
CREATE OR REPLACE FUNCTION public.domains_guard_customer_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF current_user IN ('firstfold_app', 'webfold_app') AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION '% may only add a domain as pending', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 3. appointments_guard_customer_transition
CREATE OR REPLACE FUNCTION public.appointments_guard_customer_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
DECLARE
  person_changed boolean;
BEGIN
  IF current_user NOT IN ('firstfold_app', 'webfold_app') THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'booked' AND NEW.status IN ('cancelled', 'done', 'no_show'))
  ) THEN
    RAISE EXCEPTION '% may not move an appointment from % to %', current_user, OLD.status, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id
     AND NOT (OLD.status = 'booked' AND NEW.status = 'booked') THEN
    RAISE EXCEPTION '% may only change practitioner_id on a booked appointment that stays booked', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.handled_by_user_id IS DISTINCT FROM OLD.handled_by_user_id
     AND NEW.handled_by_user_id IS DISTINCT FROM public.app_current_user_id() THEN
    RAISE EXCEPTION '% may only set handled_by_user_id to its own user id', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'done' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION '% may not mark an appointment done before it has started', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'no_show' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION '% may not mark an appointment a no-show before it has started', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.seen_at IS NOT NULL AND NEW.seen_at IS DISTINCT FROM OLD.seen_at THEN
    RAISE EXCEPTION '% may not clear or change seen_at once it is set', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = OLD.status AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.done_at IS NOT DISTINCT FROM OLD.done_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION '% may not change cancel_reason, cancelled_at, done_at or no_show_at without changing status', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'done' AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION '% may not set cancel_reason, cancelled_at or no_show_at when marking an appointment done', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'cancelled' AND NOT (
    NEW.done_at IS NOT DISTINCT FROM OLD.done_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION '% may not set done_at or no_show_at when cancelling an appointment', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'no_show' AND NEW.status <> OLD.status AND NOT (
    NEW.no_show_at IS NOT NULL
    AND NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.done_at IS NOT DISTINCT FROM OLD.done_at
  ) THEN
    RAISE EXCEPTION '% must stamp no_show_at, and only no_show_at, when marking an appointment a no-show', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  person_changed :=
    NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.patient_name IS DISTINCT FROM OLD.patient_name
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.patient_note IS DISTINCT FROM OLD.patient_note
    OR NEW.clinic_note IS DISTINCT FROM OLD.clinic_note;

  IF person_changed AND NOT (
    -- merge
    (
      NEW.status = OLD.status
      AND OLD.patient_id IS NOT NULL
      AND NEW.patient_id IS NOT NULL
      AND NEW.patient_id <> OLD.patient_id
      AND NEW.patient_name IS NOT DISTINCT FROM OLD.patient_name
      AND NEW.phone IS NOT DISTINCT FROM OLD.phone
      AND NEW.email IS NOT DISTINCT FROM OLD.email
      AND NEW.patient_note IS NOT DISTINCT FROM OLD.patient_note
      AND NEW.clinic_note IS NOT DISTINCT FROM OLD.clinic_note
    )
    OR
    -- erase
    (
      NEW.status = OLD.status
      AND OLD.patient_id IS NOT NULL
      AND NOT (OLD.status = 'booked' AND OLD.starts_at > now())
      AND NEW.patient_id IS NULL
      AND NEW.phone IS NULL
      AND NEW.email IS NULL
      AND NEW.patient_note IS NULL
      AND NEW.clinic_note IS NULL
      AND NEW.patient_name = 'Deleted patient'
    )
  ) THEN
    RAISE EXCEPTION '% may only change a booking''s patient details by merging or erasing a patient', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 4. support_guard_message_identity
CREATE OR REPLACE FUNCTION public.support_guard_message_identity()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.author_user_id IS DISTINCT FROM public.app_current_user_id() THEN
    RAISE EXCEPTION 'Support message author must match the current user';
  END IF;
  IF current_user IN ('firstfold_app', 'webfold_app') AND (NEW.author_role <> 'customer' OR NEW.visibility <> 'public') THEN
    RAISE EXCEPTION 'Customers may add only public customer replies';
  END IF;
  IF current_user IN ('firstfold_staff', 'webfold_staff') AND NEW.author_role <> 'staff' THEN
    RAISE EXCEPTION 'Staff must write as staff';
  END IF;
  IF NEW.author_role = 'staff' THEN
    IF (current_user NOT IN ('firstfold_staff', 'webfold_staff')) OR NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = NEW.author_user_id AND active) THEN
      RAISE EXCEPTION 'Support staff messages require an active staff author';
    END IF;
  END IF;
  IF NEW.author_role = 'customer' AND NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = NEW.ticket_id AND requester_user_id = NEW.author_user_id) THEN
    RAISE EXCEPTION 'Support customer author must own the ticket';
  END IF;
  IF NEW.details IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_each(NEW.details) d WHERE jsonb_typeof(d.value) <> 'string' OR d.key NOT IN ('pageUrl', 'stepsToReproduce', 'expectedBehavior', 'actualBehavior', 'browserDevice', 'invoiceReference', 'requestedChange', 'accountEmail')
      OR length(d.value #>> '{}') > CASE d.key WHEN 'pageUrl' THEN 2048 WHEN 'browserDevice' THEN 200 WHEN 'invoiceReference' THEN 200 WHEN 'accountEmail' THEN 254 ELSE 2000 END
  ) THEN
    RAISE EXCEPTION 'Invalid structured support details';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- 5. support_deny_history_mutation
CREATE OR REPLACE FUNCTION public.support_deny_history_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF current_user NOT IN ('firstfold_app', 'firstfold_staff', 'firstfold_public', 'webfold_app', 'webfold_staff', 'webfold_public')
     AND (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = OLD.ticket_id AND t.requester_user_id = nullif(current_setting('support.erase_user', true), ''))
       OR OLD.ticket_id::text = nullif(current_setting('support.purge_ticket', true), '')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Support history is append-only';
END
$$;
