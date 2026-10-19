CREATE TABLE "privacy_request_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_request_otps_phone_check" CHECK ("privacy_request_otps"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "privacy_request_otps_code_hash_check" CHECK (char_length("privacy_request_otps"."code_hash") > 0),
	CONSTRAINT "privacy_request_otps_attempts_check" CHECK ("privacy_request_otps"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "privacy_request_otps_expires_at_idx" ON "privacy_request_otps" USING btree ("expires_at");
--> statement-breakpoint

-- Codes for requests made on the public form: created, attempted, verified and deleted by the privacy request routes on the
-- staff connection, and purged an hour after they expire. The customer and public form roles get no privilege.
ALTER TABLE privacy_request_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY privacy_request_otps_staff_all ON privacy_request_otps FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_request_otps TO bb_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bb_staff') THEN
    CREATE POLICY privacy_request_otps_legacy_staff_all ON privacy_request_otps FOR ALL TO bb_staff USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_request_otps TO bb_staff;
  END IF;
END $$;
