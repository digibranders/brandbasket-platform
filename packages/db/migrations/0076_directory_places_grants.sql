-- Grants and row-level security for the directory place registry (0075), in the same pattern as 0057. Staff-only:
-- every reader and writer runs on the staff connection (the platform's /api/directory/* routes, the feed, the staff
-- console, and the listing-account server code in apps/platform/lib/server/listing-account.ts), so webfold_app and
-- webfold_public get nothing. A business's URL is never the customer's to change.
--
-- No DELETE anywhere: a place id is permanent, even after its business closes. The legacy keys are frozen at cutover
-- and the URL changes are an audit trail, so neither gets UPDATE either.
GRANT SELECT, INSERT, UPDATE ON directory_places TO webfold_staff;
--> statement-breakpoint

GRANT SELECT, INSERT ON directory_place_legacy_keys TO webfold_staff;
--> statement-breakpoint

GRANT SELECT, INSERT ON directory_place_url_changes TO webfold_staff;
--> statement-breakpoint

ALTER TABLE directory_places ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE directory_place_legacy_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE directory_place_url_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_places_staff_all ON directory_places FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY directory_place_legacy_keys_staff_all ON directory_place_legacy_keys FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY directory_place_url_changes_staff_all ON directory_place_url_changes FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
