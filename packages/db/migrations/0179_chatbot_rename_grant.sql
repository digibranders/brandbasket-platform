-- A customer can rename their own chatbot, the name they see on their OyeChats page. Only the name (and the updated_at that
-- Drizzle refreshes on every update) is writable: the status, the OyeChats bot number and the website stay with staff.
GRANT UPDATE (name, updated_at) ON chatbots TO fynix_app;
--> statement-breakpoint

CREATE POLICY chatbots_tenant_rename ON chatbots FOR UPDATE TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
