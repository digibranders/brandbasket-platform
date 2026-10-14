-- Which modules a business has: staff switch them on from the admin Features section, the customer reads their
-- own row (the dashboard nav depends on it) and neither ever writes it through the app connection.
GRANT SELECT ON business_modules TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON business_modules TO fynix_staff;
--> statement-breakpoint

ALTER TABLE business_modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_modules_tenant_select ON business_modules FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY business_modules_staff_all ON business_modules FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Closures and the announcement banner are client-editable opening-hours-adjacent facts: the customer manages
-- them fully through the app connection, same as business_hours.
GRANT SELECT, INSERT, DELETE ON business_closures TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON business_closures TO fynix_staff;
--> statement-breakpoint

ALTER TABLE business_closures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_closures_tenant_all ON business_closures FOR ALL TO fynix_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY business_closures_staff_all ON business_closures FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON business_announcements TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON business_announcements TO fynix_staff;
--> statement-breakpoint

ALTER TABLE business_announcements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_announcements_tenant_all ON business_announcements FOR ALL TO fynix_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY business_announcements_staff_all ON business_announcements FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Appointment tables: the customer reaches them only while the module is on, enforced here as well as in the app.
-- NOT SECURITY DEFINER, unlike a first draft of this function: a SECURITY DEFINER function runs with the
-- privileges (and search_path) of its owner, and a caller can plant a same-named relation or a same-named
-- function ahead of it on its own pg_temp schema, which is searched before public by default. Verified live: as
-- fynix_app, a temp business_modules table made this function see a fabricated "enabled" row for a business
-- that never had the module switched on, and separately a temp view plus a pg_temp function let arbitrary SQL
-- run with the function owner's privileges. A plain (non-definer) function has none of that: it runs as the
-- calling role, so it sees exactly what fynix_app's own policies let it see, and its unqualified names cannot
-- be shadowed into running as someone else. The one thing it loses -- reading business_modules for a business
-- the caller cannot otherwise see -- was never needed: fynix_app's own SELECT policy on business_modules
-- already scopes every row it can see to app_current_business_id(), so this check can only ever confirm the
-- caller's own tenant has the module on, never probe another tenant's. No SET clause, like app_current_business_id
-- and app_current_user_id in 0002, but unlike those it wraps an EXISTS subquery, which blocks Postgres from
-- inlining it into the row-level security policies below; it still runs as a cheap per-row index lookup.
CREATE FUNCTION app_module_enabled(target_business uuid, target_module public.business_module) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.business_modules m
      WHERE m.business_id = target_business AND m.module = target_module AND m.enabled)
  $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_module_enabled(uuid, business_module) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_module_enabled(uuid, business_module) TO fynix_app, fynix_staff;
--> statement-breakpoint

-- appointment_settings: the customer reads it and may flip accepting/paused_message, and change the slot length,
-- minimum notice and booking window on the settings page. Nothing else on the row is theirs to change, and there
-- is no customer insert or delete (the row is seeded when the module is switched on). Appointments send no email
-- of any kind, so there is no notify_emails column to grant here. "New" is tracked per booking (appointments.
-- seen_at below), not here, so there is no last_seen_at column to grant either.
GRANT SELECT ON appointment_settings TO fynix_app;
--> statement-breakpoint

GRANT UPDATE (accepting, paused_message, slot_minutes, min_notice_minutes, horizon_days, updated_at)
  ON appointment_settings TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON appointment_settings TO fynix_staff;
--> statement-breakpoint

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY appointment_settings_tenant_all ON appointment_settings FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY appointment_settings_staff_all ON appointment_settings FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- appointment_services: the customer manages their own service list (add, rename, reorder, archive) but never
-- deletes a row, since past appointments may still point at it.
GRANT SELECT, INSERT ON appointment_services TO fynix_app;
--> statement-breakpoint

GRANT UPDATE (name, position, archived_at) ON appointment_services TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON appointment_services TO fynix_staff;
--> statement-breakpoint

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY appointment_services_tenant_all ON appointment_services FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY appointment_services_staff_all ON appointment_services FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- appointments: inserted by the platform's site endpoints only after OTP verification, on the staff connection
-- (the client site has no app credentials, and a booking visitor is not signed in to anything), so fynix_app is
-- never granted INSERT here. The customer reads and works appointments (cancel, mark done, leave a note, mark
-- seen) through the column grant below; it never deletes one.
GRANT SELECT ON appointments TO fynix_app;
--> statement-breakpoint

GRANT UPDATE (status, cancel_reason, clinic_note, cancelled_at, done_at, handled_by_user_id, seen_at) ON appointments TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON appointments TO fynix_staff;
--> statement-breakpoint

-- fynix_app's column grant above already refuses any UPDATE naming business_id, the patient fields, the local_*
-- / starts_at / ends_at schedule, service_* or created_at -- Postgres checks column privileges before a trigger
-- ever runs, so a trigger re-checking those columns would be unreachable dead code. `status` IS in that grant,
-- though, so nothing at the privilege level stops fynix_app setting it to any value; this trigger holds it to
-- the two transitions the dashboard is allowed to make (booked -> cancelled, booked -> done), mirroring
-- projects_guard_customer_transition in 0014. current_user is the session role here because the function is not
-- SECURITY DEFINER.
--
-- It also guards handled_by_user_id, which is in the same column grant: any team member may work any of their
-- business's appointments (read a clinic note left by a colleague, leave their own, cancel or complete it), so the
-- column is left free to update, but only to the caller's own id or left unchanged -- never reassigned to name
-- someone else as the handler.
--
-- A third guard covers a status-preserving update (saveClinicNote, markAppointmentSeen, or a plain "claim" that
-- only touches handled_by_user_id): the column grant above still admits cancel_reason, cancelled_at and done_at on
-- such a write, since the grant does not vary by whether status happens to change. Those columns are only ever
-- meant to move together with the cancel/done transition, so when NEW.status = OLD.status this trigger requires
-- every one of them to also stay exactly as it was -- leaving clinic_note, handled_by_user_id and seen_at as the
-- only columns a status-preserving update may actually change (seen_at only forward, per the guard below).
--
-- Two more guards cover the transitioning update itself, which the third guard above does not reach (it only
-- fires when NEW.status = OLD.status): the same column grant lets a single UPDATE move status to 'done' while also
-- setting cancel_reason/cancelled_at, or move it to 'cancelled' while also setting done_at, in the very statement
-- that makes the transition, since nothing about "status changed" on its own stops the other columns from moving
-- too. A cancelled appointment should never carry a done_at, and a done appointment should never carry a
-- cancel_reason or cancelled_at, so these hold those columns to OLD's value (always null in practice, since
-- 'booked' is the only status either edge starts from) on exactly the transition that sets them.
--
-- seen_at is "new", tracked per booking like unread rather than at the settings level: it starts null and
-- markAppointmentSeen sets it once the dashboard has shown that booking. This guard runs regardless of whether
-- status is changing, since the column grant does not distinguish a transitioning update from a status-preserving
-- one: once OLD.seen_at is set, fynix_app may not clear it back to null or move it to a different timestamp --
-- only the null -> value transition is allowed, so a booking already marked seen can never look unseen again.
CREATE FUNCTION appointments_guard_customer_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF current_user = 'fynix_app' AND NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'booked' AND NEW.status IN ('cancelled', 'done'))
  ) THEN
    RAISE EXCEPTION 'fynix_app may not move an appointment from % to %', OLD.status, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- transitionAppointment (packages/db) already holds this same rule application-side (its "done" edge adds
  -- `starts_at <= now` to the UPDATE's own WHERE clause), same as it holds the module/accepting check that
  -- bookSlot repeats inside its advisory lock. This is that rule's database-side backstop, for exactly the same
  -- reason: only a check inside the trigger itself is enforced against every caller, not only the one query
  -- path that happens to add it today.
  IF current_user = 'fynix_app' AND NEW.status = 'done' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION 'fynix_app may not mark an appointment done before it has started'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF current_user = 'fynix_app'
    AND NEW.handled_by_user_id IS DISTINCT FROM OLD.handled_by_user_id
    AND NEW.handled_by_user_id IS DISTINCT FROM public.app_current_user_id()
  THEN
    RAISE EXCEPTION 'fynix_app may only set handled_by_user_id to its own user id'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF current_user = 'fynix_app' AND OLD.seen_at IS NOT NULL AND NEW.seen_at IS DISTINCT FROM OLD.seen_at THEN
    RAISE EXCEPTION 'fynix_app may not clear or change seen_at once it is set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF current_user = 'fynix_app' AND NEW.status = OLD.status AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.done_at IS NOT DISTINCT FROM OLD.done_at
  ) THEN
    RAISE EXCEPTION 'fynix_app may only change clinic_note, handled_by_user_id and seen_at without changing status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF current_user = 'fynix_app' AND NEW.status = 'done' AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
  ) THEN
    RAISE EXCEPTION 'fynix_app may not set cancel_reason or cancelled_at when marking an appointment done'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF current_user = 'fynix_app' AND NEW.status = 'cancelled' AND NEW.done_at IS DISTINCT FROM OLD.done_at THEN
    RAISE EXCEPTION 'fynix_app may not set done_at when cancelling an appointment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER appointments_guard_customer_transition
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_guard_customer_transition();
--> statement-breakpoint

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- handled_by_user_id is guarded by the trigger above instead of a WITH CHECK clause here: a WITH CHECK on this
-- policy could only compare NEW to the tenant, not to OLD.handled_by_user_id, so it could not tell "left
-- unchanged" apart from "reassigned to me" -- both look like "id = app_current_user_id() or null" from a single
-- row's new values alone.
CREATE POLICY appointments_tenant_all ON appointments FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY appointments_staff_all ON appointments FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- booking_otps: the pending-booking OTP challenge. The client site never reaches this table directly (it only
-- calls the platform's own server routes, which run on the staff connection), and no customer dashboard ever
-- needs to see it either -- staff-only, no app or public grants, no RLS policy for anyone but fynix_staff.
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_otps TO fynix_staff;
--> statement-breakpoint

ALTER TABLE booking_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY booking_otps_staff_all ON booking_otps FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- sms_messages: the local outbox for every SMS the platform would otherwise send (OTP codes above all). Staff-only
-- for the same reason as booking_otps -- the admin outbox page (staff connection) is the only place a code is
-- ever visible locally, and it is where listSmsMessages reads from.
GRANT SELECT, INSERT ON sms_messages TO fynix_staff;
--> statement-breakpoint

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY sms_messages_staff_all ON sms_messages FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
