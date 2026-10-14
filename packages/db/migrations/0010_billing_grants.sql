-- Customers read their own billing rows and never write them: every write is a consequence of a
-- provider event, applied by the app's own code paths under the staff role.
GRANT SELECT ON plans TO fynix_app, fynix_staff;
--> statement-breakpoint

GRANT SELECT ON subscriptions, payments TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON subscriptions, payments TO fynix_staff;
--> statement-breakpoint

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Prices are the same for everyone in a currency, so there is nothing tenant-specific to hide here.
CREATE POLICY plans_readable ON plans FOR SELECT TO fynix_app, fynix_staff USING (true);
--> statement-breakpoint

-- app_current_business_id() reads the request-scoped GUC set by withTenantScope; it is null outside
-- a scoped transaction, which matches no row.
CREATE POLICY subscriptions_tenant_read ON subscriptions
  FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY payments_tenant_read ON payments
  FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY subscriptions_staff_all ON subscriptions FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY payments_staff_all ON payments FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
