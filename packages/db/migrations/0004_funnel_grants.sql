-- fynix_public is the marketing site's connection: it may only create leads.
GRANT USAGE ON SCHEMA public TO fynix_public;
--> statement-breakpoint

GRANT INSERT ON leads TO fynix_public;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO fynix_public;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON leads, setup_invites TO fynix_staff;
--> statement-breakpoint

GRANT SELECT, INSERT ON email_messages TO fynix_staff;
--> statement-breakpoint

GRANT INSERT ON email_messages TO fynix_public;
--> statement-breakpoint

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE setup_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The public role writes but never reads: no SELECT policy exists for it.
CREATE POLICY leads_public_insert ON leads
  FOR INSERT TO fynix_public WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY email_messages_public_insert ON email_messages
  FOR INSERT TO fynix_public WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY leads_staff_all ON leads
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY setup_invites_staff_all ON setup_invites
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY email_messages_staff_all ON email_messages
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
