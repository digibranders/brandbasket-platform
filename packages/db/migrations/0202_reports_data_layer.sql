CREATE TABLE "metric_breakdowns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text NOT NULL,
	"month" date NOT NULL,
	"dimension" text NOT NULL,
	"rows" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_breakdowns_source_check" CHECK ("metric_breakdowns"."source" in ('own', 'gsc', 'ga4')),
	CONSTRAINT "metric_breakdowns_month_check" CHECK (extract(day from "metric_breakdowns"."month") = 1),
	CONSTRAINT "metric_breakdowns_dimension_check" CHECK ("metric_breakdowns"."dimension" ~ '^[a-z_]{1,30}$'),
	CONSTRAINT "metric_breakdowns_rows_check" CHECK (jsonb_typeof("metric_breakdowns"."rows") = 'array' and jsonb_array_length("metric_breakdowns"."rows") <= 100 and pg_column_size("metric_breakdowns"."rows") <= 65536)
);
--> statement-breakpoint
CREATE TABLE "metric_daily" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"day" date NOT NULL,
	"value" double precision NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_daily_metric_check" CHECK ("metric_daily"."metric" ~ '^(own|gsc|ga4)\.[a-z0-9_]{1,40}$'),
	CONSTRAINT "metric_daily_value_check" CHECK ("metric_daily"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service" text NOT NULL,
	"month" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"pdf_key" text,
	"composed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_staff_id" text,
	"reviewed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_documents_service_check" CHECK ("report_documents"."service" in ('website', 'social', 'search')),
	CONSTRAINT "report_documents_month_check" CHECK (extract(day from "report_documents"."month") = 1),
	CONSTRAINT "report_documents_state_check" CHECK ("report_documents"."state" in ('draft', 'held', 'approved', 'sent')),
	CONSTRAINT "report_documents_content_check" CHECK (jsonb_typeof("report_documents"."content") = 'object' and pg_column_size("report_documents"."content") <= 262144),
	CONSTRAINT "report_documents_version_check" CHECK ("report_documents"."content_version" >= 1),
	CONSTRAINT "report_documents_pdf_key_check" CHECK ("report_documents"."pdf_key" is null or "report_documents"."pdf_key" = 'reports/' || "report_documents"."id" || '.pdf'),
	CONSTRAINT "report_documents_approved_check" CHECK ("report_documents"."state" not in ('approved', 'sent') or "report_documents"."reviewed_at" is not null),
	CONSTRAINT "report_documents_sent_check" CHECK (("report_documents"."state" = 'sent') = ("report_documents"."sent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "report_source_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_source_runs_source_check" CHECK ("report_source_runs"."source" in ('own', 'gsc', 'ga4')),
	CONSTRAINT "report_source_runs_window_check" CHECK ("report_source_runs"."window_end" >= "report_source_runs"."window_start"),
	CONSTRAINT "report_source_runs_error_check" CHECK ("report_source_runs"."ok" = ("report_source_runs"."error" is null) and ("report_source_runs"."error" is null or char_length("report_source_runs"."error") <= 300))
);
--> statement-breakpoint
CREATE TABLE "report_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_sources_source_check" CHECK ("report_sources"."source" in ('gsc', 'ga4')),
	CONSTRAINT "report_sources_status_check" CHECK ("report_sources"."status" in ('pending', 'connected', 'access_lost')),
	CONSTRAINT "report_sources_external_id_check" CHECK (char_length(btrim("report_sources"."external_id")) between 1 and 200),
	CONSTRAINT "report_sources_error_check" CHECK ("report_sources"."last_error" is null or char_length("report_sources"."last_error") <= 300)
);
--> statement-breakpoint
ALTER TABLE "metric_breakdowns" ADD CONSTRAINT "metric_breakdowns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_documents" ADD CONSTRAINT "report_documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_documents" ADD CONSTRAINT "report_documents_reviewed_by_staff_id_users_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_source_runs" ADD CONSTRAINT "report_source_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_breakdowns_business_source_month_dimension_idx" ON "metric_breakdowns" USING btree ("business_id","source","month","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_daily_business_metric_day_idx" ON "metric_daily" USING btree ("business_id","metric","day");--> statement-breakpoint
CREATE UNIQUE INDEX "report_documents_business_service_month_idx" ON "report_documents" USING btree ("business_id","service","month");--> statement-breakpoint
CREATE INDEX "report_documents_state_idx" ON "report_documents" USING btree ("state","month");--> statement-breakpoint
CREATE INDEX "report_source_runs_business_idx" ON "report_source_runs" USING btree ("business_id","source","window_end");--> statement-breakpoint
CREATE UNIQUE INDEX "report_sources_business_source_idx" ON "report_sources" USING btree ("business_id","source");
--> statement-breakpoint
-- Jobs and staff write everything here on the staff connection. The customer reads two tables and nothing else:
-- their own report sources (the To do step shows the state) and their own reports once sent. The raw numbers stay private.
GRANT SELECT ON report_sources, report_documents TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON report_source_runs TO bb_staff;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON metric_daily, metric_breakdowns, report_sources, report_documents TO bb_staff;
--> statement-breakpoint
-- Names, not whole rows: a business, source, metric, day or month never changes.
GRANT UPDATE (external_id, status, last_ok_at, last_error, updated_at) ON report_sources TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (value, fetched_at) ON metric_daily TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (rows, fetched_at) ON metric_breakdowns TO bb_staff;
--> statement-breakpoint
GRANT UPDATE (state, content, content_version, pdf_key, composed_at, reviewed_by_staff_id, reviewed_at, sent_at, updated_at) ON report_documents TO bb_staff;
--> statement-breakpoint
ALTER TABLE report_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_source_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE metric_daily ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE metric_breakdowns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE report_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY report_sources_tenant_select ON report_sources FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY report_sources_staff_all ON report_sources FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY report_source_runs_staff_all ON report_source_runs FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY metric_daily_staff_all ON metric_daily FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY metric_breakdowns_staff_all ON metric_breakdowns FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- A draft, a held or an approved report is staff's working copy: the customer sees a report only once it is sent.
CREATE POLICY report_documents_tenant_select ON report_documents FOR SELECT TO bb_app USING (business_id = app_current_business_id() AND state = 'sent');
--> statement-breakpoint
CREATE POLICY report_documents_staff_all ON report_documents FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The rules every writer meets. A report starts as a draft, identity is frozen, the arrows are the ones in
-- report-states.ts, the document can change only while it is a draft or held, a sent report never changes, and a
-- report that goes back to draft or held loses its review.
CREATE OR REPLACE FUNCTION public.report_documents_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' THEN
      RAISE EXCEPTION 'A report starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'sent' THEN
    RAISE EXCEPTION 'A sent report is never changed' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(NEW.id, NEW.business_id, NEW.service, NEW.month, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.service, OLD.month, OLD.created_at) THEN
    RAISE EXCEPTION 'A report''s identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    CASE OLD.state
      WHEN 'draft' THEN NEW.state IN ('held', 'approved')
      WHEN 'held' THEN NEW.state IN ('draft', 'approved')
      WHEN 'approved' THEN NEW.state IN ('held', 'sent')
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'A report cannot move from % to %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.content IS DISTINCT FROM OLD.content OR NEW.content_version IS DISTINCT FROM OLD.content_version)
     AND NOT (OLD.state IN ('draft', 'held') AND NEW.state IN ('draft', 'held')) THEN
    RAISE EXCEPTION 'A report''s document can change only while it is a draft or held' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state IN ('draft', 'held') THEN
    NEW.reviewed_at := NULL;
    NEW.reviewed_by_staff_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER report_documents_guard BEFORE INSERT OR UPDATE ON report_documents FOR EACH ROW EXECUTE FUNCTION public.report_documents_guard();
