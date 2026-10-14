-- What the owner chose on the one entry page (docs/superpowers/specs/2026-09-30-single-entry-premium-design.md): they
-- have their own website, they want only the free listing, or they want the Premium membership. Null for a business
-- made from a setup link and for accounts opened before the question was asked. drizzle-kit's DDL, unchanged. No new
-- grants: the app role already selects `businesses` and staff already update it (0001).
CREATE TYPE "public"."signup_choice" AS ENUM('own_website', 'listing_only', 'premium');--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "signup_choice" "signup_choice";
