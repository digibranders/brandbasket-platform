CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'staff' NOT NULL,
	"subject_name" text,
	"subject_contact" text NOT NULL,
	"subject_user_id" text,
	"details" text,
	"status" text DEFAULT 'received' NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"received_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"handled_by" text,
	"closed_at" timestamp with time zone,
	"outcome" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_requests_kind_check" CHECK ("privacy_requests"."kind" in ('access', 'correction', 'erasure', 'nomination', 'grievance', 'listing_removal', 'content_report')),
	CONSTRAINT "privacy_requests_channel_check" CHECK ("privacy_requests"."channel" in ('web', 'app', 'email', 'staff')),
	CONSTRAINT "privacy_requests_status_check" CHECK ("privacy_requests"."status" in ('received', 'verifying', 'in_progress', 'closed')),
	CONSTRAINT "privacy_requests_outcome_check" CHECK ("privacy_requests"."outcome" is null or "privacy_requests"."outcome" in ('fulfilled', 'refused', 'withdrawn')),
	CONSTRAINT "privacy_requests_contact_check" CHECK (char_length("privacy_requests"."subject_contact") between 3 and 320),
	CONSTRAINT "privacy_requests_name_check" CHECK ("privacy_requests"."subject_name" is null or char_length("privacy_requests"."subject_name") <= 200),
	CONSTRAINT "privacy_requests_details_check" CHECK ("privacy_requests"."details" is null or char_length("privacy_requests"."details") <= 4000),
	CONSTRAINT "privacy_requests_resolution_check" CHECK ("privacy_requests"."resolution" is null or char_length("privacy_requests"."resolution") <= 2000),
	CONSTRAINT "privacy_requests_due_check" CHECK ("privacy_requests"."due_at" >= "privacy_requests"."received_at"),
	CONSTRAINT "privacy_requests_closed_check" CHECK (("privacy_requests"."status" = 'closed') = ("privacy_requests"."closed_at" is not null and "privacy_requests"."outcome" is not null))
);
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_reference_idx" ON "privacy_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_due_idx" ON "privacy_requests" USING btree ("status","due_at");
--> statement-breakpoint

-- Every rights request and grievance, with the date each is due. Staff may read, add and update rows and may not delete one:
-- a request once received stays in the tracker. The customer and public form roles get no privilege yet; the public form
-- and the signed-in settings form add their own insert policies when they are built.
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY privacy_requests_staff_select ON privacy_requests FOR SELECT TO fynix_staff USING (true);
--> statement-breakpoint

CREATE POLICY privacy_requests_staff_insert ON privacy_requests FOR INSERT TO fynix_staff WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY privacy_requests_staff_update ON privacy_requests FOR UPDATE TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON privacy_requests TO fynix_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fynix_staff') THEN
    CREATE POLICY privacy_requests_legacy_staff_select ON privacy_requests FOR SELECT TO fynix_staff USING (true);
    CREATE POLICY privacy_requests_legacy_staff_insert ON privacy_requests FOR INSERT TO fynix_staff WITH CHECK (true);
    CREATE POLICY privacy_requests_legacy_staff_update ON privacy_requests FOR UPDATE TO fynix_staff USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON privacy_requests TO fynix_staff;
  END IF;
END $$;
