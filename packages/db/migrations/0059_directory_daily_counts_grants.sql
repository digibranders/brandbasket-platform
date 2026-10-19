-- Grants and row-level security for the directory's daily interest counts (0058), in the same pattern as 0055 and
-- 0057. Staff-only: the marketing website holds no database credentials and reaches these counts only through the
-- platform's POST /api/directory/events and GET /api/directory/signals, which run on the staff connection. So
-- bb_app and bb_public get nothing, and the only policy is bb_staff's.
--
-- The table holds aggregate counts only (no addresses, no user agents, nothing personal). DELETE is granted for the
-- opportunistic purge of days older than 60, which Trending never looks at.
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_daily_counts TO bb_staff;
--> statement-breakpoint

ALTER TABLE directory_daily_counts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_daily_counts_staff_all ON directory_daily_counts FOR ALL TO bb_staff USING (true) WITH CHECK (true);
