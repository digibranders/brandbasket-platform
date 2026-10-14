-- Customers may read their whole site...
GRANT SELECT ON websites, pages, page_sections, gallery_items, blog_posts, site_releases TO webfold_app;
--> statement-breakpoint

-- ...but only edit an editable section's content, their gallery, and their blog. Pages, sections-as-such and
-- releases stay staff/system-only, whatever the UI shows.
GRANT UPDATE (content, visible, updated_at) ON page_sections TO webfold_app;
--> statement-breakpoint

GRANT INSERT, UPDATE, DELETE ON gallery_items TO webfold_app;
--> statement-breakpoint

GRANT INSERT, UPDATE, DELETE ON blog_posts TO webfold_app;
--> statement-breakpoint

-- Staff and system work do everything, including building pages and sections and cutting releases.
GRANT SELECT, INSERT, UPDATE, DELETE ON websites, pages, page_sections, gallery_items, blog_posts TO webfold_staff;
--> statement-breakpoint

-- Releases are immutable: even staff only ever INSERT.
GRANT SELECT, INSERT ON site_releases TO webfold_staff;
--> statement-breakpoint

ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_releases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY websites_tenant_select ON websites FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY websites_staff_all ON websites FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY pages_tenant_select ON pages FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY pages_staff_all ON pages FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY page_sections_tenant_select ON page_sections FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
-- The column grant above already limits *which* columns webfold_app can touch; this limits *which rows*: only ones
-- staff marked customer_editable, and only within the caller's own business.
CREATE POLICY page_sections_customer_update ON page_sections FOR UPDATE TO webfold_app
  USING (business_id = app_current_business_id() AND customer_editable)
  WITH CHECK (business_id = app_current_business_id() AND customer_editable);
--> statement-breakpoint
CREATE POLICY page_sections_staff_all ON page_sections FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY gallery_items_tenant_all ON gallery_items FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY gallery_items_staff_all ON gallery_items FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY blog_posts_tenant_all ON blog_posts FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY blog_posts_staff_all ON blog_posts FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY site_releases_tenant_select ON site_releases FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY site_releases_staff_select_insert ON site_releases FOR SELECT TO webfold_staff
  USING (true);
--> statement-breakpoint
CREATE POLICY site_releases_staff_insert ON site_releases FOR INSERT TO webfold_staff
  WITH CHECK (true);
