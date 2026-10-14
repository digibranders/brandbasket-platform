-- Grants for India Post's PIN code directory (0084). Public reference data, the same for every business, so there is
-- no row-level security: the customer's connection reads it (the Listing tab's PIN lookup), the staff connection
-- reads it and the import writes it. Nobody deletes: a re-import upserts.

GRANT SELECT ON india_pincodes TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON india_pincodes TO webfold_staff;
