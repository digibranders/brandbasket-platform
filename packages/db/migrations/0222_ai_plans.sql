-- The plans on sale from 2026-11-06 (owner): Social Media Management (social-media) and Paid Ads Management (paid-ads)
-- replace Social Media and Ads (digital-growth) and Local SEO + AEO (local-seo-aeo), and Dedicated Expert Monitoring
-- (expert-monitoring) is a monthly add-on. The old ids stay allowed: subscriptions bought before keep billing them at the
-- price stored on their lines, and nothing here changes a row. An intake can name up to every service.
ALTER TABLE "bundled_add_ons" DROP CONSTRAINT "bundled_add_ons_add_on_check";--> statement-breakpoint
ALTER TABLE "client_intakes" DROP CONSTRAINT "client_intakes_services_check";--> statement-breakpoint
ALTER TABLE "client_intakes" DROP CONSTRAINT "client_intakes_size_check";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_add_on_check" CHECK ("bundled_add_ons"."add_on" in ('managed-website', 'social-media', 'paid-ads', 'expert-monitoring', 'digital-growth', 'local-seo-aeo'));--> statement-breakpoint
ALTER TABLE "client_intakes" ADD CONSTRAINT "client_intakes_services_check" CHECK ("client_intakes"."asked_for_services" <@ array['managed-website', 'social-media', 'paid-ads', 'expert-monitoring', 'digital-growth', 'local-seo-aeo']::text[]);--> statement-breakpoint
ALTER TABLE "client_intakes" ADD CONSTRAINT "client_intakes_size_check" CHECK (coalesce(char_length("client_intakes"."business_type"), 0) <= 60 and coalesce(char_length("client_intakes"."business_subtype"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_goal"), 0) <= 60
        and coalesce(char_length("client_intakes"."website_state"), 0) <= 60 and coalesce(char_length("client_intakes"."primary_action"), 0) <= 60 and coalesce(char_length("client_intakes"."design_direction"), 0) <= 60
        and coalesce(char_length("client_intakes"."search_scope"), 0) <= 60 and coalesce(char_length("client_intakes"."existing_website_url"), 0) <= 300
        and cardinality("client_intakes"."social_channels") <= 8 and cardinality("client_intakes"."asked_for_services") <= 6);
