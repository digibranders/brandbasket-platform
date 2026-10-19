-- A sign-up code can now be emailed as well as texted (the Brandbasket sign-up registers with an email address, not a mobile
-- number). account_otps held only a phone number, with a check that no email could satisfy, so a code gets either a
-- phone or an email, never both and never neither. Existing rows all have a phone, so they satisfy the new check. Grants
-- and row-level security (0073) are per table, so they cover the new column unchanged. drizzle-kit's DDL otherwise.
ALTER TABLE "account_otps" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_otps" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "account_otps" ADD CONSTRAINT "account_otps_email_check" CHECK ("account_otps"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("account_otps"."email") <= 254);--> statement-breakpoint
ALTER TABLE "account_otps" ADD CONSTRAINT "account_otps_contact_check" CHECK (("account_otps"."phone" IS NULL) <> ("account_otps"."email" IS NULL));
