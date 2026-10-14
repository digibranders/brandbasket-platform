-- Postgres search for the /in directory (docs/superpowers/plans/2026-10-06-directory-listings-in-database.md and the
-- 2026-10-01 benchmark, website-listing/docs/superpowers/notes/2026-10-01-postgres-search-benchmark.md). Both
-- extensions are trusted (PG 13+), so the database owner that runs migrations may create them.
-- f_unaccent is unaccent marked IMMUTABLE, which an index or generated column needs; the dictionary is named so the
-- result never depends on search_path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
