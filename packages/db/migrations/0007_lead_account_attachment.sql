-- Staff repair path: a customer whose account was created but whose business was not can be attached to one by
-- hand, and the lead records who did it. Null for every lead that went through the normal setup link.
ALTER TABLE "leads" ADD COLUMN "attached_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "attached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_attached_by_staff_id_staff_members_user_id_fk" FOREIGN KEY ("attached_by_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;