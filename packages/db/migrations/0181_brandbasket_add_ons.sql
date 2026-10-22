-- Brandbasket sells two add-ons, Digital Growth and Local SEO + AEO (packages/shared/src/lib/billing/add-ons.ts), in place of
-- Fynix's Social media, Outreach and lead generation, and Paid advertising. A Brandbasket database starts with none of
-- Fynix's add-on rows; this refuses to run on one that has any rather than leave rows the new checks would reject.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "add_on_subscriptions" WHERE "add_on" NOT IN ('digital-growth', 'local-seo-aeo'))
    OR EXISTS (SELECT 1 FROM "bundled_add_ons" WHERE "add_on" NOT IN ('digital-growth', 'local-seo-aeo'))
    OR EXISTS (SELECT 1 FROM "add_on_provider_plans" WHERE "add_on" NOT IN ('digital-growth', 'local-seo-aeo')) THEN
    RAISE EXCEPTION 'brandbasket_add_ons: this database has add-on rows for add-ons Brandbasket does not sell';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" DROP CONSTRAINT "add_on_subscriptions_add_on_check";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" DROP CONSTRAINT "bundled_add_ons_add_on_check";--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_add_on_check" CHECK ("add_on_subscriptions"."add_on" in ('digital-growth', 'local-seo-aeo'));--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_add_on_check" CHECK ("bundled_add_ons"."add_on" in ('digital-growth', 'local-seo-aeo'));
