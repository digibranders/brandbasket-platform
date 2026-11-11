-- The plans on sale from 2026-11-06 (owner): Website Management, Social Media Management (social-media), Paid Ads
-- Management (paid-ads) and Dedicated Expert Monitoring (expert-monitoring). Social Media and Ads (digital-growth) and
-- Local SEO + AEO (local-seo-aeo) are gone. There are no real customers yet (owner, 2026-11-11), so any row a test left
-- with an old id is moved to the plan that took its slot, at the price stored on it, and the old ids are no longer allowed.
-- Nothing is deleted: payments, charges and invoices keep pointing at the same rows.
ALTER TABLE "add_on_subscriptions" DROP CONSTRAINT "add_on_subscriptions_add_on_check";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" DROP CONSTRAINT "bundled_add_ons_add_on_check";--> statement-breakpoint
ALTER TABLE "client_intakes" DROP CONSTRAINT "client_intakes_services_check";--> statement-breakpoint
ALTER TABLE "client_intakes" DROP CONSTRAINT "client_intakes_size_check";--> statement-breakpoint
UPDATE "bundled_add_ons" SET "add_on" = CASE "add_on" WHEN 'digital-growth' THEN 'social-media' ELSE 'paid-ads' END WHERE "add_on" IN ('digital-growth', 'local-seo-aeo');--> statement-breakpoint
UPDATE "add_on_subscriptions" SET "add_on" = CASE "add_on" WHEN 'digital-growth' THEN 'social-media' ELSE 'paid-ads' END WHERE "add_on" IN ('digital-growth', 'local-seo-aeo');--> statement-breakpoint
UPDATE "add_on_provider_plans" SET "add_on" = CASE "add_on" WHEN 'digital-growth' THEN 'social-media' ELSE 'paid-ads' END WHERE "add_on" IN ('digital-growth', 'local-seo-aeo');--> statement-breakpoint
UPDATE "client_intakes" SET "asked_for_services" = array_replace(array_replace("asked_for_services", 'digital-growth', 'social-media'), 'local-seo-aeo', 'paid-ads') WHERE "asked_for_services" && array['digital-growth', 'local-seo-aeo']::text[];--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_add_on_check" CHECK ("add_on_subscriptions"."add_on" in ('social-media', 'paid-ads'));--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_add_on_check" CHECK ("bundled_add_ons"."add_on" in ('managed-website', 'social-media', 'paid-ads', 'expert-monitoring'));--> statement-breakpoint
ALTER TABLE "client_intakes" ADD CONSTRAINT "client_intakes_services_check" CHECK ("client_intakes"."asked_for_services" <@ array['managed-website', 'social-media', 'paid-ads', 'expert-monitoring']::text[]);--> statement-breakpoint
ALTER TABLE "client_intakes" ADD CONSTRAINT "client_intakes_size_check" CHECK (coalesce(char_length("client_intakes"."business_type"), 0) <= 60 and coalesce(char_length("client_intakes"."business_subtype"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_goal"), 0) <= 60
        and coalesce(char_length("client_intakes"."website_state"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_action"), 0) <= 60 and coalesce(char_length("client_intakes"."design_direction"), 0) <= 60
        and coalesce(char_length("client_intakes"."search_scope"), 0) <= 60 and coalesce(char_length("client_intakes"."existing_website_url"), 0) <= 300
        and cardinality("client_intakes"."social_channels") <= 8 and cardinality("client_intakes"."asked_for_services") <= 4);
