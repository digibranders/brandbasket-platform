-- A free listing account can add a business the directory does not have yet (docs/superpowers/specs/2026-09-30-add-my-
-- business-design.md): its claim is marked `added` and carries the street address its owner typed. Claims made from an
-- existing page stay `claimed` with no address. drizzle-kit's DDL, unchanged. No new grants: the table's own (0065)
-- cover the new columns, and the customer still writes nothing here.
CREATE TYPE "public"."directory_claim_origin" AS ENUM('claimed', 'added');--> statement-breakpoint
ALTER TABLE "directory_claims" ADD COLUMN "origin" "directory_claim_origin" DEFAULT 'claimed' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD COLUMN "street_address" text;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_street_address_check" CHECK (("directory_claims"."origin" = 'added') = ("directory_claims"."street_address" is not null) and ("directory_claims"."street_address" is null or (char_length("directory_claims"."street_address") between 1 and 200 and "directory_claims"."street_address" = btrim("directory_claims"."street_address") and "directory_claims"."street_address" !~ '[\r\n]')));
