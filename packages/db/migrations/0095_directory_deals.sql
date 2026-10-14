CREATE TYPE "public"."directory_deal_status" AS ENUM('live', 'taken_down');--> statement-breakpoint
CREATE TABLE "directory_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"badge" text NOT NULL,
	"terms" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "directory_deal_status" DEFAULT 'live' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_down_at" timestamp with time zone,
	"taken_down_by_user_id" text,
	"taken_down_reason" text,
	"removed_at" timestamp with time zone,
	CONSTRAINT "directory_deals_text_check" CHECK (char_length(btrim("directory_deals"."title")) between 1 and 60 and char_length(btrim("directory_deals"."badge")) between 1 and 20 and char_length(btrim("directory_deals"."terms")) between 1 and 90),
	CONSTRAINT "directory_deals_dates_check" CHECK ("directory_deals"."ends_on" >= "directory_deals"."starts_on" and "directory_deals"."ends_on" - "directory_deals"."starts_on" < 90),
	CONSTRAINT "directory_deals_taken_down_check" CHECK (("directory_deals"."status" = 'taken_down') = ("directory_deals"."taken_down_at" is not null) and ("directory_deals"."taken_down_at" is null) = ("directory_deals"."taken_down_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_deals" ADD CONSTRAINT "directory_deals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_deals" ADD CONSTRAINT "directory_deals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_deals" ADD CONSTRAINT "directory_deals_taken_down_by_user_id_users_id_fk" FOREIGN KEY ("taken_down_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_deals_business_idx" ON "directory_deals" USING btree ("business_id","ends_on") WHERE "directory_deals"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "directory_deals_on_show_idx" ON "directory_deals" USING btree ("starts_on","ends_on") WHERE "directory_deals"."status" = 'live' and "directory_deals"."removed_at" is null;--> statement-breakpoint
GRANT SELECT ON directory_deals TO fynix_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON directory_deals TO fynix_staff;
--> statement-breakpoint
ALTER TABLE directory_deals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_deals_tenant_read ON directory_deals FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY directory_deals_staff_all ON directory_deals FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
