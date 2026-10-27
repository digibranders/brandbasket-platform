CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"due_on" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"link_url" text,
	"image_key" text,
	"image_mime" text,
	"image_bytes" integer,
	"image_width" integer,
	"image_height" integer,
	"image_sha256" text,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" text,
	"published_at" timestamp with time zone,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_kind_service_check" CHECK (("deliverables"."kind" = 'post' and "deliverables"."service" = 'social') or ("deliverables"."kind" in ('page', 'listing') and "deliverables"."service" = 'search')),
	CONSTRAINT "deliverables_status_check" CHECK ("deliverables"."status" in ('planned', 'awaiting_approval', 'approved', 'published')),
	CONSTRAINT "deliverables_title_check" CHECK (char_length(btrim("deliverables"."title")) between 3 and 140),
	CONSTRAINT "deliverables_caption_check" CHECK ("deliverables"."caption" is null or char_length("deliverables"."caption") <= 600),
	CONSTRAINT "deliverables_link_check" CHECK ("deliverables"."link_url" is null or (char_length("deliverables"."link_url") <= 500 and "deliverables"."link_url" ~ '^https://')),
	CONSTRAINT "deliverables_post_date_check" CHECK ("deliverables"."kind" <> 'post' or "deliverables"."due_on" is not null),
	CONSTRAINT "deliverables_post_only_check" CHECK ("deliverables"."kind" = 'post' or ("deliverables"."status" in ('planned', 'published') and "deliverables"."image_key" is null and "deliverables"."caption" is null)),
	CONSTRAINT "deliverables_image_check" CHECK (num_nulls("deliverables"."image_key", "deliverables"."image_mime", "deliverables"."image_bytes", "deliverables"."image_width", "deliverables"."image_height", "deliverables"."image_sha256") in (0, 6)),
	CONSTRAINT "deliverables_image_key_check" CHECK ("deliverables"."image_key" is null or "deliverables"."image_key" = 'deliverables/' || "deliverables"."id" || '/display'),
	CONSTRAINT "deliverables_approved_check" CHECK ("deliverables"."status" <> 'approved' or ("deliverables"."approved_at" is not null and "deliverables"."approved_by_user_id" is not null)),
	CONSTRAINT "deliverables_published_check" CHECK ("deliverables"."status" <> 'published' or "deliverables"."published_at" is not null),
	CONSTRAINT "deliverables_published_post_check" CHECK ("deliverables"."kind" <> 'post' or "deliverables"."status" <> 'published' or "deliverables"."approved_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text NOT NULL,
	"month" date NOT NULL,
	"url" text NOT NULL,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_reports_service_check" CHECK ("monthly_reports"."service" in ('social', 'search')),
	CONSTRAINT "monthly_reports_month_check" CHECK (extract(day from "monthly_reports"."month") = 1),
	CONSTRAINT "monthly_reports_url_check" CHECK (char_length("monthly_reports"."url") <= 500 and "monthly_reports"."url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_events_kind_check" CHECK ("site_events"."kind" in ('call', 'whatsapp', 'form'))
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_staff_id_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_updated_by_staff_id_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverables_business_status_idx" ON "deliverables" USING btree ("business_id","status","due_on");--> statement-breakpoint
CREATE INDEX "deliverables_business_service_idx" ON "deliverables" USING btree ("business_id","service","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_business_service_month_idx" ON "monthly_reports" USING btree ("business_id","service","month");--> statement-breakpoint
CREATE INDEX "site_events_business_idx" ON "site_events" USING btree ("business_id","occurred_at");
--> statement-breakpoint
-- Customers read their own rows and write nothing; their one door is approve_deliverables below.
GRANT SELECT ON deliverables, monthly_reports, site_events TO bb_app;
--> statement-breakpoint
-- Staff may update named columns only. approved_at and approved_by_user_id are not among them, so a staff UPDATE cannot
-- forge an approval (the table's check refuses status 'approved' without them). An insert cannot be narrowed the same
-- way: Drizzle names every column in an INSERT (the unset ones as DEFAULT) and Postgres checks the privilege for each
-- name, as 0189 found for setup_call_bookings. So the guard trigger below nulls the approval columns on insert.
GRANT SELECT, DELETE ON deliverables TO bb_staff;
--> statement-breakpoint
GRANT INSERT ON deliverables TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (title, caption, due_on, status, link_url, image_key, image_mime, image_bytes, image_width, image_height, image_sha256, published_at, updated_at) ON deliverables TO bb_staff;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_reports TO bb_staff;
--> statement-breakpoint
-- The ingest route inserts on the staff connection once the site token has proven the business.
GRANT SELECT, INSERT, DELETE ON site_events TO bb_staff;
--> statement-breakpoint
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY deliverables_tenant_select ON deliverables FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY deliverables_staff_all ON deliverables FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY monthly_reports_tenant_select ON monthly_reports FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY monthly_reports_staff_all ON monthly_reports FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY site_events_tenant_select ON site_events FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY site_events_staff_all ON site_events FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The rules every writer meets. Identity is frozen, the arrows are the ones in deliverable-states.ts, a post cannot be
-- published without approval, an approved post's words, picture and date cannot change in place, and leaving
-- approved (back to the customer) clears the approval.
CREATE OR REPLACE FUNCTION public.deliverables_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('planned', 'awaiting_approval') OR (NEW.status = 'awaiting_approval' AND NEW.kind <> 'post') THEN
      RAISE EXCEPTION 'A deliverable starts planned, or a post starts awaiting approval' USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := NULL;
    NEW.approved_by_user_id := NULL;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id, NEW.business_id, NEW.service, NEW.kind, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.service, OLD.kind, OLD.created_at) THEN
    RAISE EXCEPTION 'A deliverable''s identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    CASE
      WHEN NEW.kind <> 'post' THEN OLD.status = 'planned' AND NEW.status = 'published'
      WHEN OLD.status = 'planned' THEN NEW.status = 'awaiting_approval'
      WHEN OLD.status = 'awaiting_approval' THEN NEW.status IN ('planned', 'approved')
      WHEN OLD.status = 'approved' THEN NEW.status IN ('published', 'awaiting_approval')
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'A % cannot move from % to %', NEW.kind, OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND ROW(NEW.title, NEW.caption, NEW.image_sha256, NEW.due_on) IS DISTINCT FROM ROW(OLD.title, OLD.caption, OLD.image_sha256, OLD.due_on) THEN
    RAISE EXCEPTION 'Send an approved post back to awaiting approval before changing it' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'awaiting_approval' THEN
    NEW.approved_at := NULL;
    NEW.approved_by_user_id := NULL;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER deliverables_guard
  BEFORE INSERT OR UPDATE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION public.deliverables_guard();
--> statement-breakpoint
-- The customer's one write. It approves posts of the signed-in business that are awaiting approval, only the ids it
-- is given (at most 50), and returns how many it approved: a post staff pulled back meanwhile is simply not counted.
CREATE OR REPLACE FUNCTION public.approve_deliverables(p_ids uuid[])
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  approved integer;
BEGIN
  IF public.app_current_user_id() IS NULL OR public.app_current_business_id() IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = public.app_current_business_id() AND m.user_id = public.app_current_user_id()) THEN
    RAISE EXCEPTION 'deliverable_not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 50 THEN
    RAISE EXCEPTION 'deliverable_bad_request' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.deliverables
     SET status = 'approved', approved_at = now(), approved_by_user_id = public.app_current_user_id(), updated_at = now()
   WHERE id = ANY (p_ids) AND business_id = public.app_current_business_id() AND kind = 'post' AND status = 'awaiting_approval';
  GET DIAGNOSTICS approved = ROW_COUNT;
  RETURN approved;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.approve_deliverables(uuid[]) FROM PUBLIC, bb_app, bb_staff, bb_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.approve_deliverables(uuid[]) TO bb_app;
