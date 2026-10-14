-- Erasing website visitor accounts. 0118 left the staff role with no DELETE on directory_visitors, so a request to delete
-- an account, and the 24-month purge of accounts nobody has come back to, had no way to happen. Staff only, like every
-- other grant on the table: the website still reaches visitors only through the platform's routes, which run as staff.
--
GRANT DELETE ON directory_visitors TO fynix_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fynix_staff') THEN
    GRANT DELETE ON directory_visitors TO fynix_staff;
  END IF;
END $$;
