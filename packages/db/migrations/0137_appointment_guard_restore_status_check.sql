-- Puts back what 0132 dropped from the appointment guard. A customer may not mark an appointment done or a no-show before
-- it has started, but that rule is about the move itself: it must not also block the customer's other edits (marking a
-- booking seen, say) to a future booking that staff already marked done or a no-show. 0051 had it as
-- `OLD.status <> 'done'`; 0132 rewrote the guard without it, so for fynix_app those edits
-- were refused. Everything else in the function is 0132's, unchanged.
CREATE OR REPLACE FUNCTION public.appointments_guard_customer_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
DECLARE
  person_changed boolean;
BEGIN
  IF current_user NOT IN ('fynix_app', 'fynix_app') THEN
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

  IF NEW.status = 'done' AND OLD.status <> 'done' AND OLD.starts_at > now() THEN
    RAISE EXCEPTION '% may not mark an appointment done before it has started', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'no_show' AND OLD.status <> 'no_show' AND OLD.starts_at > now() THEN
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
