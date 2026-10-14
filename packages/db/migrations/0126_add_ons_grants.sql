-- Grants and row-level security for add-ons (migration 0125). Customers read their own add-ons, add-on payment links and
-- press releases; every write goes through a server path that checks access and then uses the staff connection, as for
-- payments and charges (0048). The Razorpay plan table is staff only. No DELETE for anyone: these are the record of
-- what was sold, and erasure keeps them. fynix_public gets nothing.

GRANT SELECT ON add_on_subscriptions, add_on_payments, press_releases TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON add_on_subscriptions, add_on_payments, press_releases, add_on_provider_plans TO fynix_staff;
--> statement-breakpoint

ALTER TABLE add_on_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE add_on_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE press_releases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE add_on_provider_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY add_on_subscriptions_tenant_select ON add_on_subscriptions FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY add_on_payments_tenant_select ON add_on_payments FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY press_releases_tenant_select ON press_releases FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY add_on_subscriptions_staff_all ON add_on_subscriptions FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY add_on_payments_staff_all ON add_on_payments FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY press_releases_staff_all ON press_releases FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY add_on_provider_plans_staff_all ON add_on_provider_plans FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
