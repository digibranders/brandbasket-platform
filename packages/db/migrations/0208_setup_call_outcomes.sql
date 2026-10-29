CREATE TYPE "public"."kickoff_outcome" AS ENUM('completed', 'customer_no_show', 'team_no_show', 'rescheduled', 'unknown');--> statement-breakpoint
CREATE TABLE "setup_call_outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"outcome" "kickoff_outcome" NOT NULL,
	"note" text,
	"call_starts_at" timestamp with time zone,
	"call_ends_at" timestamp with time zone,
	"recorded_by_staff_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_call_outcomes_note_check" CHECK ("setup_call_outcomes"."note" is null or char_length(btrim("setup_call_outcomes"."note")) between 3 and 600)
);
--> statement-breakpoint
ALTER TABLE "setup_call_outcomes" ADD CONSTRAINT "setup_call_outcomes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_call_outcomes" ADD CONSTRAINT "setup_call_outcomes_recorded_by_staff_id_users_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setup_call_outcomes_business_idx" ON "setup_call_outcomes" USING btree ("business_id","recorded_at");
--> statement-breakpoint
-- Staff record the call and read the record. Append only: the outcome is never edited or removed, so there is no UPDATE or DELETE
-- grant, and the rows go only with their business. The customer role has no grant and no policy here.
GRANT SELECT, INSERT ON setup_call_outcomes TO bb_staff;
--> statement-breakpoint
ALTER TABLE setup_call_outcomes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY setup_call_outcomes_staff_select ON setup_call_outcomes FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
CREATE POLICY setup_call_outcomes_staff_insert ON setup_call_outcomes FOR INSERT TO bb_staff WITH CHECK (true);
