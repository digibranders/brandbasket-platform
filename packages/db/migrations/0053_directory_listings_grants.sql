-- Grants and row-level security for the listing tables 0052 added. The split is by writer: staff own
-- directory_listings (every column shapes the web address or was checked by staff), the client owns the text and
-- switches in listing_content. The customer role can read its own two rows and update only listing_content's
-- client columns; it can never insert or delete either, so a listing exists only when staff create it.
-- bb_public gets nothing: the directory reads listings through the platform's feed route on the staff connection.

GRANT SELECT ON directory_listings TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON directory_listings TO bb_staff;
--> statement-breakpoint

ALTER TABLE directory_listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_listings_tenant_read ON directory_listings FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_listings_staff_all ON directory_listings FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT ON listing_content TO bb_app;
--> statement-breakpoint

-- business_id is left out, so a row can never be moved to another business.
GRANT UPDATE (about, tags, show_call, show_whatsapp, show_book, show_directions, show_website, visible, updated_at)
  ON listing_content TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON listing_content TO bb_staff;
--> statement-breakpoint

ALTER TABLE listing_content ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY listing_content_tenant_read ON listing_content FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY listing_content_tenant_update ON listing_content FOR UPDATE TO bb_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY listing_content_staff_all ON listing_content FOR ALL TO bb_staff USING (true) WITH CHECK (true);
