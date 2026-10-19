-- Grants and row-level security for chatbots (migration 0176). A customer reads only their own business's bots and the leads
-- those bots collected; every write is staff's (the console registers a bot, and the signed OyeChats webhook records its
-- leads on the staff connection). The webhook secrets are readable by staff alone: the app role has no grant on them, so
-- a secret can never reach the dashboard.
GRANT SELECT ON chatbots, chatbot_leads TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON chatbots, chatbot_webhook_secrets, chatbot_leads TO bb_staff;
--> statement-breakpoint

ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE chatbot_webhook_secrets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE chatbot_leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY chatbots_tenant_select ON chatbots FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY chatbot_leads_tenant_select ON chatbot_leads FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY chatbots_staff_all ON chatbots FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY chatbot_webhook_secrets_staff_all ON chatbot_webhook_secrets FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY chatbot_leads_staff_all ON chatbot_leads FOR ALL TO bb_staff USING (true) WITH CHECK (true);
