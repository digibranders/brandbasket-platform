-- Security hardening after review of 0001.
-- PostgreSQL 14 lets every role create objects in the public schema. The application roles must never be able
-- to plant functions or tables that owner-run migrations, scripts or developers would later execute or collide with.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint

-- Qualify pg_catalog so a caller's search_path can never redirect these lookups. A plain SQL body (no SET clause)
-- keeps the functions inlinable into row-level security policies.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.user_id', true), '') $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_current_business_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.business_id', true), '')::pg_catalog.uuid $$;
