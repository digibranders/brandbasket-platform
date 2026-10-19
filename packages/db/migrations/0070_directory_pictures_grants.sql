-- Grants and row-level security for listing pictures (0069), in the same pattern as 0065. The customer reads its own
-- pictures and writes nothing: uploading, removing and deciding all run on the staff connection after the platform
-- has checked the customer (or the staff member). bb_public gets nothing: the website reads an approved picture
-- through the platform's GET /api/directory/pictures/<id> on the staff connection.
--
-- No DELETE for anyone: a removed or replaced picture keeps its row (removed_at), so what was shown, who uploaded it
-- and who approved it stay on record. Only its file is deleted.

GRANT SELECT ON directory_pictures TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_pictures TO bb_staff;
--> statement-breakpoint

ALTER TABLE directory_pictures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_pictures_tenant_read ON directory_pictures FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_pictures_staff_all ON directory_pictures FOR ALL TO bb_staff USING (true) WITH CHECK (true);
