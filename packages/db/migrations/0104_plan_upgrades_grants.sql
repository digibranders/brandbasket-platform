-- Grants and row-level security for plan upgrades (0103), in the same pattern as charges (0048). The customer reads its
-- own upgrade (the Upgrade page and the Billing page's note) and writes nothing through the app connection: every
-- write goes through a server path that checks access first and then uses the staff connection, as payments do.
-- webfold_public gets nothing. No DELETE for anyone: a cancelled upgrade keeps its row, so what was quoted and paid
-- stays on record, and the account-erasure grants leave financial records whole.

GRANT SELECT ON plan_upgrades TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON plan_upgrades TO webfold_staff;
--> statement-breakpoint

ALTER TABLE plan_upgrades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY plan_upgrades_tenant_select ON plan_upgrades FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY plan_upgrades_staff_all ON plan_upgrades FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
