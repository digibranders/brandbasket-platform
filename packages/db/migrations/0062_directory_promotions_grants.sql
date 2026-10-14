-- Grants, row-level security and the no-overlap rule for directory_promotions (0061), in the same pattern as 0053.
-- The customer reads its own weeks (the Listing page's Promotion section) and may change one thing: `visible`, its
-- on/off switch for the tag. It can never insert, move or delete a week: a row is written only by the payment
-- confirmation, on the staff connection, in the transaction that marks the charge paid. webfold_public gets nothing:
-- the website reads paid tags through the platform's GET /api/directory/signals on the staff connection.
--
-- No DELETE for anyone: a paid week stays on record with the charge that bought it.
GRANT SELECT ON directory_promotions TO webfold_app;
--> statement-breakpoint

-- business_id, tag, the dates and charge_id are left out, so the customer can only show or hide its own tag.
GRANT UPDATE (visible, updated_at) ON directory_promotions TO webfold_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON directory_promotions TO webfold_staff;
--> statement-breakpoint

ALTER TABLE directory_promotions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_promotions_tenant_read ON directory_promotions FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_promotions_tenant_update ON directory_promotions FOR UPDATE TO webfold_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_promotions_staff_all ON directory_promotions FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

-- At most one tag per business at a time: a business's weeks never overlap. The payment confirmation already works
-- the start out under the business's billing lock (a renewal starts exactly when the running week ends); this makes
-- the rule hold for any other writer too. Half-open ranges, so a week may start at the instant the last one ends.
CREATE FUNCTION directory_promotions_no_overlap() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.directory_promotions AS other
    WHERE other.business_id = NEW.business_id
      AND other.id <> NEW.id
      AND other.starts_at < NEW.ends_at
      AND NEW.starts_at < other.ends_at
  ) THEN
    RAISE EXCEPTION 'business % already has a listing promotion during this week', NEW.business_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER directory_promotions_no_overlap
  BEFORE INSERT OR UPDATE OF business_id, starts_at, ends_at ON directory_promotions
  FOR EACH ROW EXECUTE FUNCTION directory_promotions_no_overlap();
