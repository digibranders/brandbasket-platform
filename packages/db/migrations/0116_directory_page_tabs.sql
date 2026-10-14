-- The optional tabs on a business's public page (Offers, Services, Products, Good to know) are the owner's to turn on;
-- Overview, Location, Reviews and Gallery are always there and are not stored. A new profile starts with none on. Every
-- page already live keeps the tabs it shows today, so the existing rows start with all four on (a tab still shows only
-- once it has something in it). Row-level security and the grants (0081) cover the new column.
ALTER TABLE "directory_business_profiles" ADD COLUMN "page_tabs" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
UPDATE "directory_business_profiles" SET "page_tabs" = ARRAY['offers','services','products','trust']::text[];--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_page_tabs_check" CHECK ("directory_business_profiles"."page_tabs" <@ ARRAY['offers','services','products','trust']::text[]);
