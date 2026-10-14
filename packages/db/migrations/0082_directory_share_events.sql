-- A visitor sharing a business's profile is counted like a page view or a contact tap (0058): once per visitor,
-- business and day, as a daily count with nothing that identifies the visitor. Shares feed the directory's ranking
-- (the share count) and never the Trending tag. drizzle-kit's DDL, unchanged.
ALTER TYPE "public"."directory_event_kind" ADD VALUE 'share';
