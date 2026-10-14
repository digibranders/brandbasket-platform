-- An owner-added business outside the opened districts (only Thane today) is placed by its PIN code: the claim keeps
-- the PIN (india_pincodes, which it then holds: ON DELETE RESTRICT) and the post-office locality the owner picked there.
-- Both or neither, and only on an added business. No grants: the columns sit on an existing table. drizzle-kit's DDL,
-- unchanged.
ALTER TABLE "directory_claims" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD COLUMN "locality_name" text;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_pincode_india_pincodes_pincode_fk" FOREIGN KEY ("pincode") REFERENCES "public"."india_pincodes"("pincode") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_pincode_check" CHECK ("directory_claims"."pincode" is null or "directory_claims"."pincode" ~ '^[1-9][0-9]{5}$');--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_postal_check" CHECK (("directory_claims"."pincode" is null) = ("directory_claims"."locality_name" is null) and ("directory_claims"."pincode" is null or "directory_claims"."origin" = 'added') and ("directory_claims"."locality_name" is null or char_length("directory_claims"."locality_name") between 1 and 200));