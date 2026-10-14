-- Roles are created by `pnpm db:roles` before migrations run.
-- fynix_app: customer-facing runtime, bound by row-level security.
-- fynix_staff: staff console and system work; explicit allow-all policies below.

GRANT USAGE ON SCHEMA public TO fynix_app, fynix_staff;
--> statement-breakpoint

-- Request-scoped identity, set with set_config(..., true) inside a transaction (SET LOCAL semantics).
CREATE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint

CREATE FUNCTION app_current_business_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.business_id', true), '')::uuid $$;
--> statement-breakpoint

-- Auth tables are looked up by email and session token before any identity is known, so they are not tenant-scoped.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO fynix_app, fynix_staff;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO fynix_app, fynix_staff;
--> statement-breakpoint

-- Tenant tables: customers read their own rows; only staff and system work may write.
GRANT SELECT ON businesses, business_members TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON businesses, business_members, staff_members TO fynix_staff;
--> statement-breakpoint

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_members_own_rows ON business_members
  FOR SELECT TO fynix_app
  USING (user_id = app_current_user_id());
--> statement-breakpoint

CREATE POLICY businesses_members_only ON businesses
  FOR SELECT TO fynix_app
  USING (
    EXISTS (
      SELECT 1 FROM business_members m
      WHERE m.business_id = businesses.id AND m.user_id = app_current_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY businesses_staff_all ON businesses
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY business_members_staff_all ON business_members
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY staff_members_staff_all ON staff_members
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
