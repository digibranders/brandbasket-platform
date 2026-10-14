-- Grants and row-level security for the Business profile (0080), in the same pattern as 0070. The customer reads its
-- own row and writes nothing: saving the Details tab and the featured video run on the staff connection after the
-- platform has checked the customer. fynix_public gets nothing.
--
-- No DELETE for anyone: a business keeps its one row, and clearing a detail sets it to null.

GRANT SELECT ON directory_business_profiles TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_business_profiles TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_business_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_business_profiles_tenant_read ON directory_business_profiles FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_business_profiles_staff_all ON directory_business_profiles FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
