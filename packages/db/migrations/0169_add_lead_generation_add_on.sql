-- The add-ons are Social media, Outreach and lead generation (new, id lead-generation) and Paid advertising (id advertising).
-- drizzle-kit's DDL, unchanged.
ALTER TABLE "add_on_subscriptions" DROP CONSTRAINT "add_on_subscriptions_add_on_check";--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_add_on_check" CHECK ("add_on_subscriptions"."add_on" in ('social-media', 'lead-generation', 'advertising', 'local-seo', 'performance-marketing'));