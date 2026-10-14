-- 0155 granted directory_staff_ad_pictures and created its policy for webfold_staff only, so the staff connection, which
-- now logs in as firstfold_staff (0132), was refused. Same privileges and policy for firstfold_staff: SELECT, INSERT and
-- UPDATE, no DELETE (a picture is marked removed, never deleted). The legacy policy and grant from 0155 stay while the
-- webfold_* to firstfold_* rollout is under way, and are made sure of here for databases that still have the old role.
GRANT SELECT, INSERT, UPDATE ON directory_staff_ad_pictures TO firstfold_staff;
--> statement-breakpoint
CREATE POLICY directory_staff_ad_pictures_firstfold_staff_all ON directory_staff_ad_pictures FOR ALL TO firstfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webfold_staff') THEN
    GRANT SELECT, INSERT, UPDATE ON directory_staff_ad_pictures TO webfold_staff;
  END IF;
END $$;
