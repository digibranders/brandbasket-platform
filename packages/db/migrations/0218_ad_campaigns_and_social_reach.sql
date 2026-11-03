CREATE TABLE "ad_campaign_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"month" date NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"objective" text NOT NULL,
	"spend_cents" integer NOT NULL,
	"budget_cents" integer,
	"impressions" integer,
	"clicks" integer,
	"leads" integer,
	"entered_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_campaign_snapshots_month_check" CHECK (extract(day from "ad_campaign_snapshots"."month") = 1),
	CONSTRAINT "ad_campaign_snapshots_name_check" CHECK (char_length(btrim("ad_campaign_snapshots"."name")) between 1 and 120),
	CONSTRAINT "ad_campaign_snapshots_platform_check" CHECK ("ad_campaign_snapshots"."platform" in ('meta', 'google')),
	CONSTRAINT "ad_campaign_snapshots_objective_check" CHECK (char_length(btrim("ad_campaign_snapshots"."objective")) between 1 and 120),
	CONSTRAINT "ad_campaign_snapshots_figures_check" CHECK ("ad_campaign_snapshots"."spend_cents" >= 0 and coalesce("ad_campaign_snapshots"."budget_cents", 0) >= 0 and coalesce("ad_campaign_snapshots"."impressions", 0) >= 0
        and coalesce("ad_campaign_snapshots"."clicks", 0) >= 0 and coalesce("ad_campaign_snapshots"."leads", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD COLUMN "reach" integer;--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD COLUMN "followers" integer;--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD COLUMN "profile_visits" integer;--> statement-breakpoint
ALTER TABLE "ad_campaign_snapshots" ADD CONSTRAINT "ad_campaign_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_snapshots" ADD CONSTRAINT "ad_campaign_snapshots_entered_by_staff_id_users_id_fk" FOREIGN KEY ("entered_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_campaign_snapshots_business_month_name_idx" ON "ad_campaign_snapshots" USING btree ("business_id","month","name");--> statement-breakpoint
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_reach_check" CHECK (coalesce("monthly_snapshots"."reach", 0) >= 0 and coalesce("monthly_snapshots"."followers", 0) >= 0 and coalesce("monthly_snapshots"."profile_visits", 0) >= 0);--> statement-breakpoint

-- ad_campaign_snapshots (plan 61, section 6): staff enter each campaign's month on the staff connection; the customer
-- only reads their own business's rows. bb_app has no write grant, so no viewer policy is needed. monthly_snapshots'
-- grants are table wide (0188), so its three new reach columns need none.
GRANT SELECT ON ad_campaign_snapshots TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON ad_campaign_snapshots TO bb_staff;
--> statement-breakpoint
-- Everything except the row's identity (id, business, month, created_at): a campaign is renamed or corrected in place.
GRANT UPDATE (name, platform, objective, spend_cents, budget_cents, impressions, clicks, leads, entered_by_staff_id, updated_at) ON ad_campaign_snapshots TO bb_staff;
--> statement-breakpoint
ALTER TABLE ad_campaign_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ad_campaign_snapshots_tenant_select ON ad_campaign_snapshots FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY ad_campaign_snapshots_staff_all ON ad_campaign_snapshots FOR ALL TO bb_staff USING (true) WITH CHECK (true);
