-- A free listing account can give its business's own website, for a claimed listing and an added business alike. It
-- shows on the business's page once the claim is approved. drizzle-kit's DDL, unchanged. No new grants: the table's
-- own (0065) cover the new column, and the customer still writes nothing here.
ALTER TABLE "directory_claims" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_website_url_check" CHECK ("directory_claims"."website_url" is null or (char_length("directory_claims"."website_url") <= 300 and "directory_claims"."website_url" ~ '^https?://[^[:space:]]+$'));