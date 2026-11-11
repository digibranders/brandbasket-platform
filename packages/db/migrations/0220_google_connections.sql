CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slot" integer DEFAULT 1 NOT NULL,
	"purpose" text NOT NULL,
	"account_email" text NOT NULL,
	"scopes" text[] NOT NULL,
	"sealed_refresh_token" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"connected_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_connections_purpose_check" CHECK ("google_connections"."purpose" in ('read', 'write')),
	CONSTRAINT "google_connections_status_check" CHECK ("google_connections"."status" in ('connected', 'access_lost')),
	CONSTRAINT "google_connections_slot_check" CHECK ("google_connections"."slot" >= 1),
	CONSTRAINT "google_connections_error_check" CHECK ("google_connections"."last_error" is null or char_length("google_connections"."last_error") <= 300)
);
--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_connected_by_staff_id_users_id_fk" FOREIGN KEY ("connected_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_connections_slot_purpose_idx" ON "google_connections" USING btree ("slot","purpose");--> statement-breakpoint
-- The Brandbasket Google account's sign-ins (plan 62). Staff only, like site_settings: the sealed refresh tokens are read on the
-- server by the staff connection, and no customer or public role is granted anything, so they have no way in.
GRANT SELECT, INSERT, UPDATE ON google_connections TO bb_staff;
--> statement-breakpoint
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY google_connections_staff_all ON google_connections FOR ALL TO bb_staff USING (true) WITH CHECK (true);
