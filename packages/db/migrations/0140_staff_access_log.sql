CREATE TABLE "staff_access_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"business_id" uuid,
	"result" text DEFAULT 'ok' NOT NULL,
	"detail" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_access_log_action_check" CHECK (char_length("staff_access_log"."action") between 1 and 64),
	CONSTRAINT "staff_access_log_result_check" CHECK ("staff_access_log"."result" in ('ok', 'failed', 'denied')),
	CONSTRAINT "staff_access_log_detail_check" CHECK ("staff_access_log"."detail" is null or char_length("staff_access_log"."detail") <= 200)
);
--> statement-breakpoint
ALTER TABLE "staff_access_log" ADD CONSTRAINT "staff_access_log_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_access_log_created_at_idx" ON "staff_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "staff_access_log_staff_created_at_idx" ON "staff_access_log" USING btree ("staff_user_id","created_at");--> statement-breakpoint

-- Who opened, exported or changed what in the staff console. Staff may read and add rows and nothing else: no UPDATE and
-- no DELETE for any application role, so a record cannot be edited or erased by the people it describes. The customer
-- roles get no privilege at all. Rows are removed after 13 months by a purge function added with the retention job.
-- Both runtime role names are covered while the webfold_* to firstfold_* rollout (0132) is under way.
ALTER TABLE staff_access_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY staff_access_log_staff_select ON staff_access_log FOR SELECT TO firstfold_staff USING (true);
--> statement-breakpoint

CREATE POLICY staff_access_log_staff_insert ON staff_access_log FOR INSERT TO firstfold_staff WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT ON staff_access_log TO firstfold_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webfold_staff') THEN
    CREATE POLICY staff_access_log_legacy_staff_select ON staff_access_log FOR SELECT TO webfold_staff USING (true);
    CREATE POLICY staff_access_log_legacy_staff_insert ON staff_access_log FOR INSERT TO webfold_staff WITH CHECK (true);
    GRANT SELECT, INSERT ON staff_access_log TO webfold_staff;
  END IF;
END $$;
