CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_ref" text NOT NULL,
	"purpose" text NOT NULL,
	"event" text DEFAULT 'given' NOT NULL,
	"notice_version" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"channel" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_records_subject_check" CHECK (char_length("consent_records"."subject_type") between 1 and 32 and char_length("consent_records"."subject_ref") between 1 and 200),
	CONSTRAINT "consent_records_purpose_check" CHECK (char_length("consent_records"."purpose") between 1 and 64),
	CONSTRAINT "consent_records_event_check" CHECK ("consent_records"."event" in ('given', 'withdrawn')),
	CONSTRAINT "consent_records_notice_version_check" CHECK (char_length("consent_records"."notice_version") between 1 and 40),
	CONSTRAINT "consent_records_language_check" CHECK (char_length("consent_records"."language") between 2 and 8),
	CONSTRAINT "consent_records_channel_check" CHECK (char_length("consent_records"."channel") between 1 and 32),
	CONSTRAINT "consent_records_ip_hash_check" CHECK ("consent_records"."ip_hash" is null or char_length("consent_records"."ip_hash") <= 128)
);
--> statement-breakpoint
CREATE INDEX "consent_records_subject_idx" ON "consent_records" USING btree ("subject_type","subject_ref","purpose","created_at");
--> statement-breakpoint

-- What people agreed to, one row per event. Staff may read and add rows; the public form connection may add rows and
-- read none; nothing may edit or delete one, so a record cannot be changed after the fact. The customer role gets no
-- privilege at all.
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY consent_records_staff_select ON consent_records FOR SELECT TO fynix_staff USING (true);
--> statement-breakpoint

CREATE POLICY consent_records_staff_insert ON consent_records FOR INSERT TO fynix_staff WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY consent_records_public_insert ON consent_records FOR INSERT TO fynix_public WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT ON consent_records TO fynix_staff;
--> statement-breakpoint

GRANT INSERT ON consent_records TO fynix_public;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fynix_staff') THEN
    CREATE POLICY consent_records_legacy_staff_select ON consent_records FOR SELECT TO fynix_staff USING (true);
    CREATE POLICY consent_records_legacy_staff_insert ON consent_records FOR INSERT TO fynix_staff WITH CHECK (true);
    GRANT SELECT, INSERT ON consent_records TO fynix_staff;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fynix_public') THEN
    CREATE POLICY consent_records_legacy_public_insert ON consent_records FOR INSERT TO fynix_public WITH CHECK (true);
    GRANT INSERT ON consent_records TO fynix_public;
  END IF;
END $$;
