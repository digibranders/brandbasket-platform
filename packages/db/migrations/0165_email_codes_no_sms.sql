-- Fynix sends no text messages and holds no texted codes. Every code is now emailed:
--
--  * Public booking (Premium Appointments): the patient gives a name, an EMAIL and a phone number. The code goes to the email
--    (booking_otps.email, new); the phone stays on the booking as a number the clinic calls, collected but never verified or
--    texted (appointments.phone and its trigger into the patients registry are untouched). A pending booking code is a
--    10-minute row, so the ones in flight are dropped rather than given an address they never had.
--  * The sms_messages outbox, which only the booking code (and the retired phone codes) ever wrote to, is dropped.
--  * account_otps held a phone OR an email (0163). Only the emailed sign-up code is left: texted rows (and the password-reset
--    and business-verification purposes, which were only ever texted) go, the phone column and its checks go, and email
--    becomes required. Short-lived code data, so there is nothing to carry over.
--  * privacy_request_otps (a rights request made on the public form) is proven by an emailed code instead of a texted one:
--    phone becomes email. Same reason, same treatment of the rows in flight.
--  * leads.phone becomes optional: a lead is reached by its email, and staff add one without a number.
--
-- drizzle-kit's DDL, with the deletes that must come before a NOT NULL column or a narrower enum.
DELETE FROM "booking_otps";--> statement-breakpoint
DELETE FROM "privacy_request_otps";--> statement-breakpoint
DELETE FROM "account_otps" WHERE "email" IS NULL OR "purpose" <> 'signup';--> statement-breakpoint
ALTER TABLE "sms_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sms_messages" CASCADE;--> statement-breakpoint
ALTER TABLE "account_otps" DROP CONSTRAINT "account_otps_phone_check";--> statement-breakpoint
ALTER TABLE "account_otps" DROP CONSTRAINT "account_otps_contact_check";--> statement-breakpoint
ALTER TABLE "privacy_request_otps" DROP CONSTRAINT "privacy_request_otps_phone_check";--> statement-breakpoint
ALTER TABLE "account_otps" ALTER COLUMN "purpose" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."account_otp_purpose";--> statement-breakpoint
CREATE TYPE "public"."account_otp_purpose" AS ENUM('signup');--> statement-breakpoint
ALTER TABLE "account_otps" ALTER COLUMN "purpose" SET DATA TYPE "public"."account_otp_purpose" USING "purpose"::"public"."account_otp_purpose";--> statement-breakpoint
ALTER TABLE "account_otps" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_otps" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "privacy_request_otps" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "account_otps" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "privacy_request_otps" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "booking_otps" ADD CONSTRAINT "booking_otps_email_check" CHECK ("booking_otps"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("booking_otps"."email") <= 254);--> statement-breakpoint
ALTER TABLE "privacy_request_otps" ADD CONSTRAINT "privacy_request_otps_email_check" CHECK ("privacy_request_otps"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("privacy_request_otps"."email") <= 254);
