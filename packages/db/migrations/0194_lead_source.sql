CREATE TYPE "public"."lead_source" AS ENUM('website_form', 'pricing_page', 'signup', 'staff');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source" "lead_source" DEFAULT 'website_form' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "plans" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "page" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_staff_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_staff_id_staff_members_user_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Accounts opened on the dashboard were written with this note by recordSignupLead; every other existing lead stays website_form.
UPDATE leads SET source = 'signup' WHERE notes LIKE 'Signed up on the dashboard%';
