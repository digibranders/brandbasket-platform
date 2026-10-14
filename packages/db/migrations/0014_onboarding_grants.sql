-- Customers write their own onboarding data through the app connection, bound by row-level security.
-- app_current_business_id() reads the request-scoped GUC set by withTenantScope; it is null outside a scoped
-- transaction, which matches no row and fails every WITH CHECK.
GRANT SELECT, INSERT, UPDATE, DELETE ON business_profiles, business_hours, services, project_briefs, domains, media_assets TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON onboarding_progress TO fynix_app;
--> statement-breakpoint

-- Customers read their project and may submit it, which is the only customer transition. They never create or
-- delete one, and may only touch the columns submission sets.
GRANT SELECT ON projects TO fynix_app;
--> statement-breakpoint

GRANT UPDATE (status, onboarding_submitted_at, sla_due_at, updated_at) ON projects TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON projects, onboarding_progress, business_profiles, business_hours, services, project_briefs, domains, media_assets TO fynix_staff;
--> statement-breakpoint

-- The customer's one transition is onboarding -> submitted. RLS cannot compare the old row with the new one, so a
-- trigger holds the app role to it; staff and system work move projects through every other state.
-- current_user is the session role here because the function is not SECURITY DEFINER.
CREATE FUNCTION projects_guard_customer_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF current_user = 'fynix_app' AND NOT (OLD.status = 'onboarding' AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION 'fynix_app may only move a project from onboarding to submitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER projects_guard_customer_transition
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_guard_customer_transition();
--> statement-breakpoint

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE project_briefs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY projects_tenant_read ON projects
  FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY projects_tenant_update ON projects
  FOR UPDATE TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY onboarding_progress_tenant_all ON onboarding_progress
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY business_profiles_tenant_all ON business_profiles
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY business_hours_tenant_all ON business_hours
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY services_tenant_all ON services
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY project_briefs_tenant_all ON project_briefs
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY domains_tenant_all ON domains
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY media_assets_tenant_all ON media_assets
  FOR ALL TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY projects_staff_all ON projects FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY onboarding_progress_staff_all ON onboarding_progress FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY business_profiles_staff_all ON business_profiles FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY business_hours_staff_all ON business_hours FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY services_staff_all ON services FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY project_briefs_staff_all ON project_briefs FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY domains_staff_all ON domains FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY media_assets_staff_all ON media_assets FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
