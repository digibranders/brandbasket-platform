CREATE TABLE "directory_visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_visitors_phone_unique" UNIQUE("phone"),
	CONSTRAINT "directory_visitors_phone_check" CHECK ("directory_visitors"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_visitors_name_check" CHECK (char_length("directory_visitors"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE INDEX "directory_visitors_last_seen_at_idx" ON "directory_visitors" USING btree ("last_seen_at");
--> statement-breakpoint
-- Grants and row-level security for website visitor accounts, in the same pattern as the directory's other tables
-- (0055, 0109). Staff-only: the marketing website holds no database credentials and reaches visitors only through the
-- platform's /api/directory/* routes, which run on the staff connection. A visitor is created or renamed when a code is
-- confirmed and touched when they come back; never deleted by the routes.
GRANT SELECT, INSERT, UPDATE ON directory_visitors TO bb_staff;
--> statement-breakpoint

ALTER TABLE directory_visitors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_visitors_staff_all ON directory_visitors FOR ALL TO bb_staff USING (true) WITH CHECK (true);
