-- The public page now sells Care plus two monthly add-ons, Social media and Advertising, with a first-checkout offer, and
-- sign-up asks where the owner is.
--
--  * add_on_subscriptions: the two new ids are allowed (the two old ids stay allowed so an old row never breaks the table);
--    offer_discount_amount_cents is the part of the discount that is the 5% lifetime offer.
--  * subscriptions: offer_discount_cents is the part of the frozen discount that is that offer, beside the stay offer.
--  * businesses: country_code (ISO alpha-2) and state_code (platform GST state code, India only), typed in at sign-up.
--
-- drizzle-kit's DDL, unchanged.
ALTER TABLE "add_on_subscriptions" DROP CONSTRAINT "add_on_subscriptions_add_on_check";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_discount_check";--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD COLUMN "offer_discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "offer_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_offer_check" CHECK ("add_on_subscriptions"."offer_discount_amount_cents" >= 0 and "add_on_subscriptions"."offer_discount_amount_cents" <= "add_on_subscriptions"."discount_amount_cents");--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_add_on_check" CHECK ("add_on_subscriptions"."add_on" in ('social-media', 'advertising', 'local-seo', 'performance-marketing'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_check" CHECK ("subscriptions"."discount_amount_cents" >= 0 and "subscriptions"."retention_discount_cents" >= 0 and "subscriptions"."offer_discount_cents" >= 0 and "subscriptions"."retention_discount_cents" + "subscriptions"."offer_discount_cents" <= "subscriptions"."discount_amount_cents" and ("subscriptions"."referral_code_id" is not null or "subscriptions"."discount_amount_cents" = "subscriptions"."retention_discount_cents" + "subscriptions"."offer_discount_cents"));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_country_code_check" CHECK ("businesses"."country_code" is null or "businesses"."country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_state_code_check" CHECK ("businesses"."state_code" is null or ("businesses"."state_code" ~ '^[a-z]{2}$' and "businesses"."country_code" = 'IN'));