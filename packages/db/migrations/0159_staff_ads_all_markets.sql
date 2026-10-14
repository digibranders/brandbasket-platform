-- A staff ad may be placed for "all categories" or "all areas" of a city: its category_slug or area_slug is then 'all',
-- the word a city's home market already uses. Such an ad holds its spot in every market it covers, so the one-ad-per-spot
-- rules of 0067 compare markets that overlap, not only markets that are equal. The platform checks the same under the
-- settlement lock before writing; these make the rule hold for any other writer.
CREATE OR REPLACE FUNCTION directory_staff_ads_spot_free() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.removed_at IS NULL AND EXISTS (
    SELECT 1 FROM public.directory_ad_wins AS win
    WHERE win.city_slug = NEW.city_slug
      AND (NEW.category_slug = 'all' OR win.category_slug = NEW.category_slug)
      AND (NEW.area_slug = 'all' OR win.area_slug = NEW.area_slug)
      AND win.placement = NEW.placement
      AND win.week_start = NEW.week_start
      AND win.spot = NEW.spot
      AND win.status <> 'lapsed'
  ) THEN
    RAISE EXCEPTION 'an auction win already holds this ad spot for the week of %', NEW.week_start
      USING ERRCODE = 'exclusion_violation';
  END IF;
  IF NEW.removed_at IS NULL AND EXISTS (
    SELECT 1 FROM public.directory_staff_ads AS other
    WHERE other.id <> NEW.id
      AND other.removed_at IS NULL
      AND other.city_slug = NEW.city_slug
      AND (other.category_slug = NEW.category_slug OR other.category_slug = 'all' OR NEW.category_slug = 'all')
      AND (other.area_slug = NEW.area_slug OR other.area_slug = 'all' OR NEW.area_slug = 'all')
      AND other.placement = NEW.placement
      AND other.week_start = NEW.week_start
      AND other.spot = NEW.spot
  ) THEN
    RAISE EXCEPTION 'another staff-placed ad already holds this ad spot for the week of %', NEW.week_start
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION directory_ad_wins_spot_free() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF NEW.status <> 'lapsed' AND EXISTS (
    SELECT 1 FROM public.directory_staff_ads AS ad
    WHERE ad.city_slug = NEW.city_slug
      AND (ad.category_slug = 'all' OR ad.category_slug = NEW.category_slug)
      AND (ad.area_slug = 'all' OR ad.area_slug = NEW.area_slug)
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
