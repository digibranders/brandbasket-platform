-- Grants and row-level security for the practitioner tables 0044 added, in the same pattern as 0042's appointment
-- tables: the customer reaches them only while the appointments module is on (app_module_enabled, from 0042), and
-- fynix_staff reads and writes every business's rows. fynix_public gets nothing: the client site reads doctors
-- through the platform's own server routes on the staff connection, exactly as it reads appointment_services.

-- practitioners: the customer manages their own doctors (add, rename, retitle, set a photo, switch between the
-- clinic's hours and their own, reorder, archive) but never deletes one, since past appointments point at it and
-- the composite foreign key from appointments would refuse the delete anyway. business_id and created_at are left
-- out of the column grant, so a practitioner can never be moved to another business.
GRANT SELECT, INSERT ON practitioners TO fynix_app;
--> statement-breakpoint

GRANT UPDATE (name, title, photo_media_id, uses_clinic_hours, position, archived_at) ON practitioners TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON practitioners TO fynix_staff;
--> statement-breakpoint

ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY practitioners_tenant_all ON practitioners FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY practitioners_staff_all ON practitioners FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- practitioner_hours and practitioner_leave: replaced wholesale on save, like business_hours and business_closures,
-- so the customer inserts and deletes rows but never updates one in place. Nothing points at these rows, so delete
-- is safe; the composite foreign key to practitioners (business_id, id) keeps every row on one of the tenant's own
-- practitioners regardless of what the policy below lets through.
GRANT SELECT, INSERT, DELETE ON practitioner_hours TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON practitioner_hours TO fynix_staff;
--> statement-breakpoint

ALTER TABLE practitioner_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY practitioner_hours_tenant_all ON practitioner_hours FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY practitioner_hours_staff_all ON practitioner_hours FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON practitioner_leave TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON practitioner_leave TO fynix_staff;
--> statement-breakpoint

ALTER TABLE practitioner_leave ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY practitioner_leave_tenant_all ON practitioner_leave FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY practitioner_leave_staff_all ON practitioner_leave FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- appointments: the clinic may reassign an upcoming booking to another of its doctors. The composite foreign key
-- appointments_practitioner_business_fk (0044) already refuses a practitioner from another business, so this grant
-- cannot be used to move a booking across tenants.
GRANT UPDATE (practitioner_id) ON appointments TO fynix_app;
--> statement-breakpoint

-- Every guard from 0042 is kept below (see 0042 for why each one exists); the only changes are the practitioner_id
-- guard after the first status check and practitioner_id added to the same-status guard's error message.
--
-- practitioner_id is now in fynix_app's column grant (above) so the clinic can reassign a booking, but only a
-- booking that is still upcoming work: a cancelled or done appointment is history, and rewriting which doctor saw
-- a patient after the fact would falsify it. So a change of practitioner_id is allowed only when the row is booked
-- before and after the update. That also means a single UPDATE may not reassign and cancel (or complete) at once,
-- since NEW.status would no longer be 'booked': reassigning and transitioning are two separate actions, each checked
-- on its own. Staff (fynix_staff) are not held to this, like every other guard here.
CREATE OR REPLACE FUNCTION appointments_guard_customer_transition() RETURNS trigger
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

  IF current_user = 'fynix_app'
    AND NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id
    AND NOT (OLD.status = 'booked' AND NEW.status = 'booked')
  THEN
    RAISE EXCEPTION 'fynix_app may only change practitioner_id on a booked appointment that stays booked'
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
    RAISE EXCEPTION 'fynix_app may only change clinic_note, handled_by_user_id, seen_at and practitioner_id without changing status'
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
