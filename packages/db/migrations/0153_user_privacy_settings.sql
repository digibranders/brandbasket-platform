CREATE TABLE "user_privacy_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"nominee_name" text NOT NULL,
	"nominee_phone" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_privacy_settings_name_check" CHECK (char_length("user_privacy_settings"."nominee_name") between 1 and 120),
	CONSTRAINT "user_privacy_settings_phone_check" CHECK ("user_privacy_settings"."nominee_phone" ~ '^\+[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- The nominee an owner names: read and written by that owner alone on the customer connection, and read by staff when a nominee
-- comes forward, and deleted by the account erasure (never otherwise changed by staff). Both runtime role names are covered while the webfold_* to firstfold_* rollout
-- (0132) is under way.
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY user_privacy_settings_customer ON user_privacy_settings FOR ALL TO firstfold_app USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint

CREATE POLICY user_privacy_settings_staff_select ON user_privacy_settings FOR SELECT TO firstfold_staff USING (true);
--> statement-breakpoint

CREATE POLICY user_privacy_settings_staff_delete ON user_privacy_settings FOR DELETE TO firstfold_staff USING (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON user_privacy_settings TO firstfold_app;
--> statement-breakpoint

GRANT SELECT, DELETE ON user_privacy_settings TO firstfold_staff;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webfold_app') THEN
    CREATE POLICY user_privacy_settings_legacy_customer ON user_privacy_settings FOR ALL TO webfold_app USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_privacy_settings TO webfold_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webfold_staff') THEN
    CREATE POLICY user_privacy_settings_legacy_staff_select ON user_privacy_settings FOR SELECT TO webfold_staff USING (true);
    CREATE POLICY user_privacy_settings_legacy_staff_delete ON user_privacy_settings FOR DELETE TO webfold_staff USING (true);
    GRANT SELECT, DELETE ON user_privacy_settings TO webfold_staff;
  END IF;
END $$;
