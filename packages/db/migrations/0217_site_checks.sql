CREATE TABLE "site_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"response_ms" integer,
	"ssl_expires_at" timestamp with time zone,
	"phone_speed_score" integer,
	"phone_lcp_ms" integer,
	"error" text,
	CONSTRAINT "site_checks_status_check" CHECK ("site_checks"."status" in ('up', 'down', 'error')),
	CONSTRAINT "site_checks_url_check" CHECK (char_length("site_checks"."url") <= 2000 and "site_checks"."url" ~ '^https://'),
	CONSTRAINT "site_checks_http_status_check" CHECK ("site_checks"."http_status" is null or "site_checks"."http_status" between 100 and 599),
	CONSTRAINT "site_checks_response_ms_check" CHECK ("site_checks"."response_ms" is null or "site_checks"."response_ms" >= 0),
	CONSTRAINT "site_checks_phone_speed_score_check" CHECK ("site_checks"."phone_speed_score" is null or "site_checks"."phone_speed_score" between 0 and 100),
	CONSTRAINT "site_checks_phone_lcp_ms_check" CHECK ("site_checks"."phone_lcp_ms" is null or "site_checks"."phone_lcp_ms" >= 0),
	CONSTRAINT "site_checks_error_check" CHECK ("site_checks"."error" is null or char_length("site_checks"."error") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "site_checks" ADD CONSTRAINT "site_checks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_checks_business_checked_idx" ON "site_checks" USING btree ("business_id","checked_at");--> statement-breakpoint

-- site_checks (plan 61, Phase 12): the site health job writes on the staff connection; the customer only reads their own
-- business's rows. bb_app has no write grant, so no viewer policy is needed. Staff delete for clean-ups.
GRANT SELECT ON site_checks TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON site_checks TO bb_staff;
--> statement-breakpoint
ALTER TABLE site_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY site_checks_tenant_select ON site_checks FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY site_checks_staff_all ON site_checks FOR ALL TO bb_staff USING (true) WITH CHECK (true);
