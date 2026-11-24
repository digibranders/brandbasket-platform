CREATE TABLE "social_auto_cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Staff and system work only (the timer job runs on the staff connection). The customer role has no grant.
GRANT SELECT, INSERT, UPDATE ON social_auto_cursor TO bb_staff;--> statement-breakpoint
ALTER TABLE social_auto_cursor ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY social_auto_cursor_staff_all ON social_auto_cursor FOR ALL TO bb_staff USING (true) WITH CHECK (true);
