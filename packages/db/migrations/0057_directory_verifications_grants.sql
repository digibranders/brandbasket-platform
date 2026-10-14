-- Grants and row-level security for verified directory businesses (0056), in the same pattern as 0055. Staff-only:
-- the marketing website holds no database credentials and reads verifications only through the platform's
-- GET /api/directory/status, which runs on the staff connection, and the staff console is the only writer. So
-- fynix_app and fynix_public get nothing, and the only policy is fynix_staff's.
--
-- DELETE is granted, unlike directory_reviews and directory_enquiries: removing a verification ("unverify") deletes
-- its row. A verification is staff's own note about a business, not a customer's review or enquiry, so there is no
-- one else's history to keep; verifying the business again simply writes a fresh row.
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_verifications TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_verifications_staff_all ON directory_verifications FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
