CREATE TABLE "project_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"status" "project_status" NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_events_reason_check" CHECK ("project_events"."reason" is null or ("project_events"."status" = 'on_hold' and char_length("project_events"."reason") between 3 and 200))
);
--> statement-breakpoint
CREATE TABLE "project_preview_images" (
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"preview_url" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"image" "bytea" NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_preview_images_project_id_pk" PRIMARY KEY("project_id"),
	CONSTRAINT "project_preview_images_type_check" CHECK ("project_preview_images"."content_type" = 'image/webp'),
	CONSTRAINT "project_preview_images_size_check" CHECK ("project_preview_images"."width" between 1 and 4000 and "project_preview_images"."height" between 1 and 8000 and octet_length("project_preview_images"."image") between 1 and 1048576)
);
--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_preview_images" ADD CONSTRAINT "project_preview_images_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_preview_images" ADD CONSTRAINT "project_preview_images_project_business_fk" FOREIGN KEY ("project_id","business_id") REFERENCES "public"."projects"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_events_project_idx" ON "project_events" USING btree ("project_id","occurred_at");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_hold_reason_check" CHECK ("projects"."on_hold_reason" is null or ("projects"."status" = 'on_hold' and char_length(btrim("projects"."on_hold_reason")) between 3 and 200));--> statement-breakpoint
-- The customer reads its own project's history and picture and writes neither. Staff read the history; only the trigger writes it.
GRANT SELECT ON project_events TO bb_app;
--> statement-breakpoint
GRANT SELECT ON project_events TO bb_staff;
--> statement-breakpoint
ALTER TABLE project_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_events_tenant_select ON project_events FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY project_events_staff_select ON project_events FOR SELECT TO bb_staff USING (true);
--> statement-breakpoint
GRANT SELECT ON project_preview_images TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON project_preview_images TO bb_staff;
--> statement-breakpoint
ALTER TABLE project_preview_images ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY project_preview_images_tenant_select ON project_preview_images FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY project_preview_images_staff_all ON project_preview_images FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The one writer of project_events. SECURITY DEFINER because the customer's own submit (onboarding to submitted) also fires it
-- and the customer role has no INSERT on the table. search_path is pinned and every name is schema-qualified.
CREATE FUNCTION public.projects_record_event() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.project_events (id, project_id, business_id, status, reason, occurred_at)
    VALUES (pg_catalog.gen_random_uuid(), NEW.id, NEW.business_id, NEW.status,
            CASE WHEN NEW.status = 'on_hold' THEN NEW.on_hold_reason ELSE NULL END, pg_catalog.now());
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER projects_record_event
  AFTER INSERT OR UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_record_event();
--> statement-breakpoint
-- History for projects that already exist: each date the table remembers, and the current status when it is none of them.
INSERT INTO project_events (id, project_id, business_id, status, reason, occurred_at)
SELECT gen_random_uuid(), p.id, p.business_id, 'onboarding'::project_status, NULL, p.created_at FROM projects p
UNION ALL SELECT gen_random_uuid(), p.id, p.business_id, 'submitted', NULL, p.onboarding_submitted_at FROM projects p WHERE p.onboarding_submitted_at IS NOT NULL
UNION ALL SELECT gen_random_uuid(), p.id, p.business_id, 'preview', NULL, p.preview_sent_at FROM projects p WHERE p.preview_sent_at IS NOT NULL
UNION ALL SELECT gen_random_uuid(), p.id, p.business_id, 'live', NULL, p.launched_at FROM projects p WHERE p.launched_at IS NOT NULL
UNION ALL SELECT gen_random_uuid(), p.id, p.business_id, p.status, p.on_hold_reason, p.updated_at FROM projects p
  WHERE p.status NOT IN ('onboarding', 'submitted', 'preview', 'live');
