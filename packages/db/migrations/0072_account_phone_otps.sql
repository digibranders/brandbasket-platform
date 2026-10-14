-- Free listing accounts sign in with a phone number and a password: users.phone_number (+ verified), and the codes
-- texted to a number to open an account or to choose a new password (account_otps). drizzle-kit's DDL, unchanged;
-- grants and row-level security for account_otps are in 0073. users needs none: its table-level grants (0001) cover
-- the new columns.
CREATE TYPE "public"."account_otp_purpose" AS ENUM('signup', 'password_reset');--> statement-breakpoint
CREATE TABLE "account_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" "account_otp_purpose" NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_otps_phone_check" CHECK ("account_otps"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "account_otps_code_hash_check" CHECK (char_length("account_otps"."code_hash") > 0),
	CONSTRAINT "account_otps_attempts_check" CHECK ("account_otps"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "account_otps_expires_at_idx" ON "account_otps" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_check" CHECK ("users"."phone_number" is null or "users"."phone_number" ~ '^\+[0-9]{8,15}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_verified_check" CHECK ("users"."phone_number" is not null or not "users"."phone_number_verified");
