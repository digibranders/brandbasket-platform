-- Grants, row-level security and the extended appointments guard for clinic patients (0050), in the same pattern as
-- 0042 and 0045. A separate migration from 0050 because the guard below names 'no_show', which 0050 added to
-- appointment_status and which Postgres refuses to use inside the transaction that added it.
--
-- patients: the customer reads their register, edits a patient's name, second phone and tags, and deletes a patient
-- (merge deletes the record merged away; erase deletes the erased one). There is no customer INSERT: a patient only
-- ever comes into being from a booking, through appointments_link_patient on the staff connection. business_id,
-- phone and created_at are left out of the column grant, so a patient can never be moved to another business, and
-- the number a patient was created from -- the key the link trigger finds them by -- is never rewritten.
-- webfold_public gets nothing, like every appointments table: the client site only reaches bookings through the
-- platform's own server routes on the staff connection.
GRANT SELECT, DELETE ON patients TO webfold_app;
--> statement-breakpoint

GRANT UPDATE (name, alt_phone, tags, updated_at) ON patients TO webfold_app;
--> statement-breakpoint

-- webfold_staff inserts through the link trigger (which runs as the inserting role, see 0050) and reads, edits and
-- removes rows for the staff console and scripts, like every other appointments table.
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO webfold_staff;
--> statement-breakpoint

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY patients_tenant_all ON patients FOR ALL TO webfold_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
--> statement-breakpoint

CREATE POLICY patients_staff_all ON patients FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- appointments: merging two patients re-points their bookings (patient_id), erasing one clears the person from
-- every booking (patient_id, patient_name, phone, email, patient_note; clinic_note was already in 0042's grant),
-- and the new no-show outcome stamps no_show_at. The composite foreign key appointments_patient_business_fk (0050)
-- already refuses another business's patient, so this grant cannot link a booking across tenants; the guard below
-- holds each column to the one shape of write that needs it.
GRANT UPDATE (patient_id, patient_name, phone, email, patient_note, no_show_at) ON appointments TO webfold_app;
--> statement-breakpoint

-- Every guard from 0045 is kept below (see 0042 and 0045 for why each one exists). What changes:
--
-- No-show is a third outcome of a booking beside cancelled and done: booked -> no_show, allowed only once the slot
-- has started (the same database-side backstop the done edge has, now shared by both), stamping no_show_at. That
-- edge, like done and cancel, may not also touch the other outcomes' columns, and no_show_at is added to the columns
-- a same-status update must leave alone -- so no_show_at changes on exactly one write, the one that makes the row a
-- no-show, and must be set by it.
--
-- The patient columns (patient_id, patient_name, phone, email, patient_note) and clinic_note may change in exactly
-- two shapes, each on its own, never together with a status change:
--  * merge: patient_id moves from one patient to another and nothing else about the person changes -- the booking
--    keeps the name and number it was made with, only which register entry it belongs to moves (mergePatients);
--  * erase: patient_id, phone, email, patient_note and clinic_note all become null and patient_name becomes
--    'Deleted patient', on a booking that was linked to a patient and is not an upcoming booked one (erasePatient
--    refuses while one exists, "Cancel it first"; this is its backstop). The slot stays, with nobody attached.
-- Anything else touching those columns is refused. That includes saving a clinic note: the dashboard no longer
-- offers the private note (spec decision 1), and clinic_note stays in 0042's grant only so erase can clear it.
--
-- Staff (webfold_staff) are not held to any of this, like every other guard here.
CREATE OR REPLACE FUNCTION appointments_guard_customer_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
DECLARE
  person_changed boolean;
BEGIN
  IF current_user <> 'webfold_app' THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'booked' AND NEW.status IN ('cancelled', 'done', 'no_show'))
  ) THEN
    RAISE EXCEPTION 'webfold_app may not move an appointment from % to %', OLD.status, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id
    AND NOT (OLD.status = 'booked' AND NEW.status = 'booked')
  THEN
    RAISE EXCEPTION 'webfold_app may only change practitioner_id on a booked appointment that stays booked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- transitionAppointment (packages/db) already holds this rule application-side (its done and no_show edges add
  -- `starts_at <= now` to the UPDATE's own WHERE clause); this is the backstop enforced against every caller.
  IF NEW.status = 'done' AND OLD.status <> 'done' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION 'webfold_app may not mark an appointment done before it has started'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'no_show' AND OLD.status <> 'no_show' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION 'webfold_app may not mark an appointment a no-show before it has started'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.handled_by_user_id IS DISTINCT FROM OLD.handled_by_user_id
    AND NEW.handled_by_user_id IS DISTINCT FROM public.app_current_user_id()
  THEN
    RAISE EXCEPTION 'webfold_app may only set handled_by_user_id to its own user id'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.seen_at IS NOT NULL AND NEW.seen_at IS DISTINCT FROM OLD.seen_at THEN
    RAISE EXCEPTION 'webfold_app may not clear or change seen_at once it is set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = OLD.status AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.done_at IS NOT DISTINCT FROM OLD.done_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION 'webfold_app may not change cancel_reason, cancelled_at, done_at or no_show_at without changing status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'done' AND NOT (
    NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION 'webfold_app may not set cancel_reason, cancelled_at or no_show_at when marking an appointment done'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'cancelled' AND NOT (
    NEW.done_at IS NOT DISTINCT FROM OLD.done_at
    AND NEW.no_show_at IS NOT DISTINCT FROM OLD.no_show_at
  ) THEN
    RAISE EXCEPTION 'webfold_app may not set done_at or no_show_at when cancelling an appointment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'no_show' AND NEW.status <> OLD.status AND NOT (
    NEW.no_show_at IS NOT NULL
    AND NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
    AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
    AND NEW.done_at IS NOT DISTINCT FROM OLD.done_at
  ) THEN
    RAISE EXCEPTION 'webfold_app must stamp no_show_at, and only no_show_at, when marking an appointment a no-show'
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
    RAISE EXCEPTION 'webfold_app may only change a booking''s patient details by merging or erasing a patient'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;
