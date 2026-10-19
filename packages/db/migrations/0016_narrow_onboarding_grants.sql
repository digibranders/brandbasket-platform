-- 0014 gave the app role every write on the onboarding tables. This narrows it to what the query layer uses, so a
-- bug or injection in the app cannot rewrite a stored file's key or type, or mark a domain verified.
REVOKE UPDATE, DELETE ON business_profiles, business_hours, services, project_briefs, domains, media_assets FROM bb_app;
--> statement-breakpoint

-- saveBusinessProfile and saveProjectBrief upsert, and replaceServices edits and soft-deletes in place.
GRANT UPDATE ON business_profiles, services, project_briefs TO bb_app;
--> statement-breakpoint

-- replaceBusinessHours deletes and re-inserts the whole set; nothing updates a row in place. It is the only
-- customer query that deletes anything.
GRANT DELETE ON business_hours TO bb_app;
--> statement-breakpoint

-- updateMediaAltText and softDeleteMediaAsset. The storage key, type, size and checksum are fixed at insert.
GRANT UPDATE (alt_text, deleted_at) ON media_assets TO bb_app;
--> statement-breakpoint

-- savePrimaryDomain confirms ownership in place or retires the row; Drizzle refreshes updated_at on each update.
-- Status belongs to domain verification, which runs as staff or system work.
GRANT UPDATE (owner_confirmed_at, removed_at, updated_at) ON domains TO bb_app;
--> statement-breakpoint

-- Drizzle names every column in an INSERT, so status cannot be withheld with a column grant there. This trigger
-- holds the app role to inserting pending domains instead.
CREATE FUNCTION domains_guard_customer_insert() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF current_user = 'bb_app' AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'bb_app may only add a domain as pending'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER domains_guard_customer_insert
  BEFORE INSERT ON domains
  FOR EACH ROW EXECUTE FUNCTION domains_guard_customer_insert();
