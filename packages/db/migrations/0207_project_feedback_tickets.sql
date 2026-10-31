CREATE TABLE "project_feedback_tickets" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_feedback_tickets_round_check" CHECK ("project_feedback_tickets"."round" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_feedback_tickets" ADD CONSTRAINT "project_feedback_tickets_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_feedback_tickets" ADD CONSTRAINT "project_feedback_tickets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_feedback_tickets" ADD CONSTRAINT "project_feedback_tickets_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_feedback_tickets_project_idx" ON "project_feedback_tickets" USING btree ("project_id","created_at");--> statement-breakpoint
-- The staff connection writes the link when a customer sends preview feedback, and staff read it from the project. The customer role
-- has no grant and no policy here: it never reads or writes these links.
GRANT SELECT, INSERT ON project_feedback_tickets TO bb_staff;
--> statement-breakpoint
ALTER TABLE project_feedback_tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_feedback_tickets_staff_select ON project_feedback_tickets FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
CREATE POLICY project_feedback_tickets_staff_insert ON project_feedback_tickets FOR INSERT TO bb_staff WITH CHECK (true);
