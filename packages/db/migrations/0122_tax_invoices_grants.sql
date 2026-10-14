-- Grants and row-level security for tax invoicing (0119 to 0121). Customers read and write their own billing details
-- through the app connection, as with business_profiles (0014); staff may also delete them, which account erasure
-- needs (0097). Customers read their own invoices and write none: invoices are issued by the payment paths on the
-- staff connection. Nobody may update or delete an invoice, staff included: an issued invoice is corrected by a credit
-- note, never edited, and it is a financial record that erasure leaves whole. The series counter is staff only.
-- webfold_public gets nothing.

GRANT SELECT, INSERT, UPDATE ON billing_profiles TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_profiles TO webfold_staff;
--> statement-breakpoint

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY billing_profiles_tenant_all ON billing_profiles FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY billing_profiles_staff_all ON billing_profiles FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT ON tax_invoices TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT ON tax_invoices TO webfold_staff;
--> statement-breakpoint

ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tax_invoices_tenant_select ON tax_invoices FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY tax_invoices_staff_select ON tax_invoices FOR SELECT TO webfold_staff USING (true);
--> statement-breakpoint

CREATE POLICY tax_invoices_staff_insert ON tax_invoices FOR INSERT TO webfold_staff WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON tax_invoice_series TO webfold_staff;
--> statement-breakpoint

ALTER TABLE tax_invoice_series ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY tax_invoice_series_staff_all ON tax_invoice_series FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
