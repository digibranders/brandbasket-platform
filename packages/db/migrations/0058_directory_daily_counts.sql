-- Daily interest counts for the directory's Trending tag (the contract's "Listing tags" section in
-- apps/platform/lib/directory-api.ts): per listing, Asia/Kolkata day and kind (a page view or a contact tap), how many
-- visitors did it. Only these aggregate counts are kept -- no IP address, no user agent, nothing personal and nothing
-- that identifies a visitor. The platform counts each visitor once per listing, kind and day through a hashed
-- rate-limit key and never stores the address itself. drizzle-kit's DDL, unchanged; the grants and row-level security
-- are in 0059.
CREATE TYPE "public"."directory_event_kind" AS ENUM('view', 'call', 'whatsapp', 'enquire', 'directions', 'website');--> statement-breakpoint
CREATE TABLE "directory_daily_counts" (
	"listing_key" text NOT NULL,
	"day" date NOT NULL,
	"kind" "directory_event_kind" NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "directory_daily_counts_pk" PRIMARY KEY("listing_key","day","kind"),
	CONSTRAINT "directory_daily_counts_listing_key_check" CHECK (char_length("directory_daily_counts"."listing_key") <= 200 and "directory_daily_counts"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_daily_counts_count_check" CHECK ("directory_daily_counts"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "directory_daily_counts_day_idx" ON "directory_daily_counts" USING btree ("day");