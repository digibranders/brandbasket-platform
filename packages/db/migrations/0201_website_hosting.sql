CREATE TABLE "website_hosting" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"vercel_project_id" text NOT NULL,
	"vercel_team_id" text,
	"paused_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_hosting_business_id_unique" UNIQUE("business_id"),
	CONSTRAINT "website_hosting_project_id_check" CHECK ("website_hosting"."vercel_project_id" ~ '^prj_[A-Za-z0-9]+$' and char_length("website_hosting"."vercel_project_id") <= 64),
	CONSTRAINT "website_hosting_team_id_check" CHECK ("website_hosting"."vercel_team_id" is null or ("website_hosting"."vercel_team_id" ~ '^team_[A-Za-z0-9]+$' and char_length("website_hosting"."vercel_team_id") <= 64)),
	CONSTRAINT "website_hosting_last_error_check" CHECK ("website_hosting"."last_error" is null or char_length("website_hosting"."last_error") <= 500)
);
--> statement-breakpoint
ALTER TABLE "website_hosting" ADD CONSTRAINT "website_hosting_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Grants and row-level security, in the pattern of 0096: only the staff connection (the console and the hosting sync)
-- reads or writes this. The customer's own database role gets nothing, so a customer never sees the project their site
-- runs on. A row goes only when the business's account is erased.
GRANT SELECT, INSERT, UPDATE, DELETE ON "website_hosting" TO bb_staff;
--> statement-breakpoint

ALTER TABLE "website_hosting" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY website_hosting_staff_all ON "website_hosting" FOR ALL TO bb_staff USING (true) WITH CHECK (true);
