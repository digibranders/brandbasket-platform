-- Guards and grants for the geography and category catalog (0112). The catalog is reference data like india_pincodes
-- (0085): the customer connection reads it, the staff connection reads and writes it, and nobody deletes (a row is
-- switched off). A slug is part of public addresses and permanent business ids, so the database freezes it.

ALTER TABLE geo_categories
  ADD CONSTRAINT geo_categories_parent_slug_fkey FOREIGN KEY (parent_slug) REFERENCES geo_categories (slug);
--> statement-breakpoint

-- Slug lock. A row starts as a draft (slug_locked_at null, still free to rename). The first time it is switched on
-- (a district to live or soon, an area or category to on) the slug is stamped as locked, and from then on the slug can
-- never change, not even by staff or a migration, because the old address would break and a business's id with it.
-- A district also keeps its state, and an area its district, for the same reason.
CREATE FUNCTION geo_guard_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slug_locked_at IS NOT NULL THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'The slug of % "%" is locked because it has been published; it cannot become "%".', TG_TABLE_NAME, OLD.slug, NEW.slug
        USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'geo_districts' THEN
      IF NEW.state_code IS DISTINCT FROM OLD.state_code THEN
        RAISE EXCEPTION 'The state of a published district cannot change.' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'geo_areas' THEN
      IF NEW.district_id IS DISTINCT FROM OLD.district_id THEN
        RAISE EXCEPTION 'A published area cannot move to another district.' USING ERRCODE = '23514';
      END IF;
    END IF;
    NEW.slug_locked_at := OLD.slug_locked_at;
  END IF;
  IF NEW.slug_locked_at IS NULL AND NEW.status::text <> 'off' THEN
    NEW.slug_locked_at := now();
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER geo_districts_guard_slug BEFORE INSERT OR UPDATE ON geo_districts FOR EACH ROW EXECUTE FUNCTION geo_guard_slug();
--> statement-breakpoint

CREATE TRIGGER geo_areas_guard_slug BEFORE INSERT OR UPDATE ON geo_areas FOR EACH ROW EXECUTE FUNCTION geo_guard_slug();
--> statement-breakpoint

CREATE TRIGGER geo_categories_guard_slug BEFORE INSERT OR UPDATE ON geo_categories FOR EACH ROW EXECUTE FUNCTION geo_guard_slug();
--> statement-breakpoint

GRANT SELECT ON geo_districts, geo_areas, geo_categories TO bb_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON geo_districts, geo_areas, geo_categories TO bb_staff;
