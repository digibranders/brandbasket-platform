-- Plan 66: the customer's own billing state (findBillingState) reads whether the business has a deal that is building or has its
-- balance due, on the tenant connection every page guard uses. payment_links stays staff-only for every other column (the token hash,
-- the contact and billing details, the staff note): bb_app gets SELECT on the seven columns the state reads or filters on, and only on the
-- business's own rows.
GRANT SELECT ("id", "business_id", "advance_paid_at", "ready_at", "paid_at", "revoked_at", "created_at") ON "payment_links" TO bb_app;
--> statement-breakpoint
CREATE POLICY payment_links_tenant_select ON "payment_links" FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
