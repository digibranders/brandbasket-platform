ALTER TABLE "projects" ADD COLUMN "assigned_staff_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status_before_hold" "project_status";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assigned_staff_id_staff_members_user_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_before_hold_check" CHECK ("projects"."status" = 'on_hold' or "projects"."status_before_hold" is null);