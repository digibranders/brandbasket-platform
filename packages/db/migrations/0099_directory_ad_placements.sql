-- Two more places an ad can show on the local directory, and the counting type for their reports: `profile` (a business
-- page) and `home` (the home page). On its own because Postgres refuses to use an enum value in the transaction that
-- added it (55P04): 0090's CHECKs use them. drizzle-kit's DDL, unchanged.
CREATE TYPE "public"."directory_ad_event_kind" AS ENUM('impression', 'click');--> statement-breakpoint
ALTER TYPE "public"."directory_ad_placement" ADD VALUE 'profile';--> statement-breakpoint
ALTER TYPE "public"."directory_ad_placement" ADD VALUE 'home';
