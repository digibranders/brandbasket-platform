ALTER TABLE "consent_records" ADD COLUMN "subject_erased_at" timestamp with time zone;--> statement-breakpoint
-- The approved retention schedule (M1 in docs/privacy/PRIVACY-PLAN.md), run nightly on the staff connection. Enquiries and
-- exit feedback already have a staff policy for every command, so they need only the privilege. The four record-keeping
-- tables were add-only; they get a DELETE policy that matches a row only once it is past its period, measured on the
-- database clock, so even the staff connection cannot remove a recent record. Consent records may additionally have
-- subject_erased_at set, once, to the current time, which starts their three years. Both runtime role names are covered
-- while the webfold_* to firstfold_* rollout (0132) is under way.
GRANT DELETE ON directory_enquiries, account_exit_feedback, staff_access_log, privacy_requests, breach_register, consent_records TO firstfold_staff;--> statement-breakpoint
GRANT UPDATE (subject_erased_at) ON consent_records TO firstfold_staff;--> statement-breakpoint
CREATE POLICY staff_access_log_staff_delete ON staff_access_log FOR DELETE TO firstfold_staff USING (created_at < now() - interval '400 days');--> statement-breakpoint
CREATE POLICY privacy_requests_staff_delete ON privacy_requests FOR DELETE TO firstfold_staff USING (status = 'closed' AND closed_at < now() - interval '3 years');--> statement-breakpoint
CREATE POLICY breach_register_staff_delete ON breach_register FOR DELETE TO firstfold_staff USING (status = 'closed' AND updated_at < now() - interval '5 years');--> statement-breakpoint
CREATE POLICY consent_records_staff_mark_erased ON consent_records FOR UPDATE TO firstfold_staff USING (subject_erased_at IS NULL) WITH CHECK (subject_erased_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute');--> statement-breakpoint
CREATE POLICY consent_records_staff_delete ON consent_records FOR DELETE TO firstfold_staff USING (subject_erased_at < now() - interval '3 years');--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webfold_staff') THEN
    GRANT DELETE ON directory_enquiries, account_exit_feedback, staff_access_log, privacy_requests, breach_register, consent_records TO webfold_staff;
    GRANT UPDATE (subject_erased_at) ON consent_records TO webfold_staff;
    CREATE POLICY staff_access_log_legacy_staff_delete ON staff_access_log FOR DELETE TO webfold_staff USING (created_at < now() - interval '400 days');
    CREATE POLICY privacy_requests_legacy_staff_delete ON privacy_requests FOR DELETE TO webfold_staff USING (status = 'closed' AND closed_at < now() - interval '3 years');
    CREATE POLICY breach_register_legacy_staff_delete ON breach_register FOR DELETE TO webfold_staff USING (status = 'closed' AND updated_at < now() - interval '5 years');
    CREATE POLICY consent_records_legacy_staff_mark_erased ON consent_records FOR UPDATE TO webfold_staff USING (subject_erased_at IS NULL) WITH CHECK (subject_erased_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute');
    CREATE POLICY consent_records_legacy_staff_delete ON consent_records FOR DELETE TO webfold_staff USING (subject_erased_at < now() - interval '3 years');
  END IF;
END $$;
