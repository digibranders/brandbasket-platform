-- Grants, row-level security and the spot rules for staff-placed ads (0066). Staff only: the customer role and
-- webfold_public get nothing (the website reads live ads through the platform's GET /api/directory/ads on the staff
-- connection). No DELETE: taking an ad down sets removed_at, so what ran and who placed it stay on record.
GRANT SELECT, INSERT, UPDATE ON directory_staff_ads TO webfold_staff;
--> statement-breakpoint

ALTER TABLE directory_staff_ads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_staff_ads_staff_all ON directory_staff_ads FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- One ad per spot per week, whoever put it there. A staff ad may not take a spot an auction win holds (a win still
-- awaiting payment holds it too), and an auction win may not take a spot a live staff ad holds. The platform checks
-- both under the settlement lock before writing; these make the rule hold for any other writer.
CREATE FUNCTION directory_staff_ads_spot_free() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.removed_at IS NULL AND EXISTS (
    SELECT 1 FROM public.directory_ad_wins AS win
    WHERE win.category_slug = NEW.category_slug
      AND win.city_slug = NEW.city_slug
      AND win.area_slug = NEW.area_slug
      AND win.placement = NEW.placement
      AND win.week_start = NEW.week_start
      AND win.spot = NEW.spot
      AND win.status <> 'lapsed'
  ) THEN
    RAISE EXCEPTION 'an auction win already holds this ad spot for the week of %', NEW.week_start
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER directory_staff_ads_spot_free
  BEFORE INSERT OR UPDATE OF category_slug, city_slug, area_slug, placement, week_start, spot, removed_at
  ON directory_staff_ads
  FOR EACH ROW EXECUTE FUNCTION directory_staff_ads_spot_free();
--> statement-breakpoint

CREATE FUNCTION directory_ad_wins_spot_free() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.status <> 'lapsed' AND EXISTS (
    SELECT 1 FROM public.directory_staff_ads AS ad
    WHERE ad.category_slug = NEW.category_slug
      AND ad.city_slug = NEW.city_slug
      AND ad.area_slug = NEW.area_slug
      AND ad.placement = NEW.placement
      AND ad.week_start = NEW.week_start
      AND ad.spot = NEW.spot
      AND ad.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a staff-placed ad already holds this ad spot for the week of %', NEW.week_start
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- INSERT only: a win's spot and week never change afterwards (0065's trigger pins them to its bid), and a status
-- change on a win that already held the spot must not be refused.
CREATE TRIGGER directory_ad_wins_spot_free
  BEFORE INSERT ON directory_ad_wins
  FOR EACH ROW EXECUTE FUNCTION directory_ad_wins_spot_free();
