CREATE TABLE "setup_call_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"invitee_uri" text,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_call_bookings_invitee_check" CHECK ("setup_call_bookings"."invitee_uri" is null or char_length("setup_call_bookings"."invitee_uri") <= 300),
	CONSTRAINT "setup_call_bookings_time_check" CHECK (("setup_call_bookings"."starts_at" is null and "setup_call_bookings"."ends_at" is null) or ("setup_call_bookings"."starts_at" is not null and "setup_call_bookings"."ends_at" is not null and "setup_call_bookings"."ends_at" > "setup_call_bookings"."starts_at"))
);
--> statement-breakpoint
ALTER TABLE "setup_call_bookings" ADD CONSTRAINT "setup_call_bookings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "setup_call_bookings_business_idx" ON "setup_call_bookings" USING btree ("business_id");--> statement-breakpoint

-- A customer notes that they booked the kickoff call and reads their own row; every row is theirs alone (row-level
-- security by business), a business never deletes its own, and staff and system paths (the account erase, a booking page's report) work on the
-- staff connection.
GRANT SELECT, INSERT, UPDATE ON setup_call_bookings TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON setup_call_bookings TO bb_staff;
--> statement-breakpoint

ALTER TABLE setup_call_bookings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY setup_call_bookings_tenant_all ON setup_call_bookings
  FOR ALL TO bb_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY setup_call_bookings_staff_all ON setup_call_bookings FOR ALL TO bb_staff USING (true) WITH CHECK (true);
