-- The Get started form now asks what kind of business the lead runs.
-- Leads captured before the question existed have none, so the column is nullable.
ALTER TABLE "leads" ADD COLUMN "business_type" text;
