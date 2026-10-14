CREATE TABLE "breach_register" (
	"id" uuid PRIMARY KEY NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"reported_cert_in_at" timestamp with time zone,
	"reported_board_at" timestamp with time zone,
	"people_notified_at" timestamp with time zone,
	"summary" text NOT NULL,
	"data_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breach_register_summary_check" CHECK (char_length("breach_register"."summary") between 1 and 2000),
	CONSTRAINT "breach_register_status_check" CHECK ("breach_register"."status" in ('open', 'contained', 'closed')),
	CONSTRAINT "breach_register_dates_check" CHECK (("breach_register"."reported_cert_in_at" is null or "breach_register"."reported_cert_in_at" >= "breach_register"."detected_at") and ("breach_register"."reported_board_at" is null or "breach_register"."reported_board_at" >= "breach_register"."detected_at") and ("breach_register"."people_notified_at" is null or "breach_register"."people_notified_at" >= "breach_register"."detected_at"))
);
--> statement-breakpoint
ALTER TABLE "breach_register" ADD CONSTRAINT "breach_register_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breach_register_detected_at_idx" ON "breach_register" USING btree ("detected_at");
--> statement-breakpoint

-- Every personal data breach, with when each report was made. Staff may read, add and update rows and may not delete one:
-- a breach once logged stays in the register. The customer and public form roles get no privilege at all.
ALTER TABLE breach_register ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY breach_register_staff_select ON breach_register FOR SELECT TO fynix_staff USING (true);
--> statement-breakpoint

CREATE POLICY breach_register_staff_insert ON breach_register FOR INSERT TO fynix_staff WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY breach_register_staff_update ON breach_register FOR UPDATE TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON breach_register TO fynix_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fynix_staff') THEN
    CREATE POLICY breach_register_legacy_staff_select ON breach_register FOR SELECT TO fynix_staff USING (true);
    CREATE POLICY breach_register_legacy_staff_insert ON breach_register FOR INSERT TO fynix_staff WITH CHECK (true);
    CREATE POLICY breach_register_legacy_staff_update ON breach_register FOR UPDATE TO fynix_staff USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON breach_register TO fynix_staff;
  END IF;
END $$;
