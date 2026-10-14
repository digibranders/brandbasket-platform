-- Grants and row-level security for account_otps (0072), in the same pattern as directory_review_otps (0055): created,
-- attempted, used up and purged by the sign-up and password-reset pages on the staff connection, because whoever asks
-- for a code has no session yet. The customer and public roles get nothing.

GRANT SELECT, INSERT, UPDATE, DELETE ON account_otps TO webfold_staff;
--> statement-breakpoint

ALTER TABLE account_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY account_otps_staff_all ON account_otps FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
