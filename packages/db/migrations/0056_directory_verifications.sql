-- Verified directory businesses (the contract's "Verified businesses" section in apps/platform/lib/directory-api.ts):
-- staff confirmed a listing's name, address and phone, so the website shows a Verified tag and, unless the business
-- asked otherwise, its number. drizzle-kit's DDL, unchanged; the grants and row-level security are in 0057.
CREATE TABLE "directory_verifications" (
	"listing_key" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"phone" text,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_verifications_listing_key_check" CHECK (char_length("directory_verifications"."listing_key") <= 200 and "directory_verifications"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_verifications_business_name_check" CHECK (char_length("directory_verifications"."business_name") between 1 and 200),
	CONSTRAINT "directory_verifications_phone_check" CHECK ("directory_verifications"."phone" is null or "directory_verifications"."phone" ~ '^\+[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "directory_verifications" ADD CONSTRAINT "directory_verifications_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_verifications_verified_at_idx" ON "directory_verifications" USING btree ("verified_at");