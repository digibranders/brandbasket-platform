-- Grants and row-level security for business videos (0105), in the same pattern as directory pictures (0070). The
-- customer reads its own videos and writes nothing: uploading, removing and taking down all run on the staff connection
-- after the platform has checked the customer (or the staff member). fynix_public gets nothing: the website reads a
-- live video through the platform's public video route, which looks it up on the staff connection.
--
-- Removing or replacing a video keeps its row (removed_at), so what was shown and who uploaded it stay on record; only its
-- two files are deleted. The one DELETE is the staff role's, for the last step of deleting an account
-- (queries/account-erasure.ts, see 0097), which erases what a person gave us.

GRANT SELECT ON directory_videos TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_videos TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_videos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_videos_tenant_read ON directory_videos FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_videos_staff_all ON directory_videos FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT DELETE ON directory_videos TO fynix_staff;
