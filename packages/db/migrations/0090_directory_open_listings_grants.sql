-- Grants and row-level security for directory_open_listings (0089), the same pattern as 0076. Staff-only: the import
-- (`pnpm directory:import-listings`) and the website's /api/directory/open-listings routes run on the staff connection,
-- so webfold_app and webfold_public get nothing. No DELETE: a business that leaves the dataset is hidden, and its id
-- stays valid for reviews and old links.
GRANT SELECT, INSERT, UPDATE ON directory_open_listings TO webfold_staff;
--> statement-breakpoint
ALTER TABLE directory_open_listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_open_listings_staff_all ON directory_open_listings FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
