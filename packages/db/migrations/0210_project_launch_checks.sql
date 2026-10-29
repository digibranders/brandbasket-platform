CREATE TABLE "project_launch_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"checked_by_staff_id" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_launch_checks_key_check" CHECK ("project_launch_checks"."check_key" ~ '^[a-z_]{3,40}$')
);
--> statement-breakpoint
ALTER TABLE "project_launch_checks" ADD CONSTRAINT "project_launch_checks_checked_by_staff_id_users_id_fk" FOREIGN KEY ("checked_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_launch_checks" ADD CONSTRAINT "project_launch_checks_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_launch_checks_project_key_idx" ON "project_launch_checks" USING btree ("project_id","check_key");
--> statement-breakpoint
-- Staff tick a launch check and untick it: a check is a row, so unticking deletes it. There is no UPDATE grant. The customer role
-- has no grant and no policy here.
GRANT SELECT, INSERT, DELETE ON project_launch_checks TO bb_staff;
--> statement-breakpoint
ALTER TABLE project_launch_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_launch_checks_staff_select ON project_launch_checks FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
CREATE POLICY project_launch_checks_staff_insert ON project_launch_checks FOR INSERT TO bb_staff WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY project_launch_checks_staff_delete ON project_launch_checks FOR DELETE TO bb_staff USING (true);
