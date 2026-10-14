-- The tagline card on a business's page (2026-10-09): one line of the owner's words and the colour it is drawn in.
-- Written by the owner from the Listing tab, so the customer role may update both columns (as 0053 does for the rest).

ALTER TABLE listing_content ADD COLUMN tagline text;
--> statement-breakpoint
ALTER TABLE listing_content ADD COLUMN tagline_colour text NOT NULL DEFAULT 'rose';
--> statement-breakpoint
ALTER TABLE listing_content ADD CONSTRAINT listing_content_tagline_check
  CHECK (tagline IS NULL OR (char_length(tagline) BETWEEN 1 AND 80 AND tagline !~ '[\r\n]'));
--> statement-breakpoint
ALTER TABLE listing_content ADD CONSTRAINT listing_content_tagline_colour_check
  CHECK (tagline_colour IN ('rose', 'burgundy', 'sand', 'sage', 'sky', 'ink'));
--> statement-breakpoint
GRANT UPDATE (tagline, tagline_colour) ON listing_content TO fynix_app;
