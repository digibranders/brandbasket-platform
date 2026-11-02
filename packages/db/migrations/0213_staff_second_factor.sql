-- Staff sign-in gets a second factor: a code emailed once the password is right. The code is an account_otps row of the new
-- purpose; a session made after the code carries second_factor_at, and the console ignores any session without it.
-- Sessions that exist now have none, so every staff member signs in again once; nothing is deleted.
ALTER TYPE "public"."account_otp_purpose" ADD VALUE 'staff_sign_in';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "second_factor_at" timestamp with time zone;
