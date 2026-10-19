CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by_staff_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_staff_id_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Staff only, like the Razorpay plan tables: customers never read a setting through their own connection. The platform
-- reads the ones it shows through its staff connection, on the server. Staff may change and clear a setting.
GRANT SELECT, INSERT, UPDATE, DELETE ON site_settings TO bb_staff;
--> statement-breakpoint

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY site_settings_staff_all ON site_settings FOR ALL TO bb_staff USING (true) WITH CHECK (true);
