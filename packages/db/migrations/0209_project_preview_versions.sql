CREATE TABLE "project_preview_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"preview_url" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sent_by_staff_id" text,
	CONSTRAINT "project_preview_versions_version_check" CHECK ("project_preview_versions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_preview_versions" ADD CONSTRAINT "project_preview_versions_sent_by_staff_id_users_id_fk" FOREIGN KEY ("sent_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_preview_versions" ADD CONSTRAINT "project_preview_versions_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_preview_versions_project_version_idx" ON "project_preview_versions" USING btree ("project_id","version");
--> statement-breakpoint
-- Staff record each preview send and read the history. Append only: a send is never edited or removed, so there is no UPDATE or
-- DELETE grant. The customer role has no grant and no policy here.
GRANT SELECT, INSERT ON project_preview_versions TO bb_staff;
--> statement-breakpoint
ALTER TABLE project_preview_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_preview_versions_staff_select ON project_preview_versions FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
CREATE POLICY project_preview_versions_staff_insert ON project_preview_versions FOR INSERT TO bb_staff WITH CHECK (true);
--> statement-breakpoint
-- A project whose preview was sent before this table existed gets its first send back as version 1, at the time and link the
-- project holds. Nobody sent it through the staff console, so there is no sender.
INSERT INTO project_preview_versions (id, project_id, business_id, version, preview_url, sent_at, sent_by_staff_id)
SELECT gen_random_uuid(), id, business_id, 1, preview_url, preview_sent_at, NULL
FROM projects
WHERE preview_url IS NOT NULL AND preview_sent_at IS NOT NULL;
