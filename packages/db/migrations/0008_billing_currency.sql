-- India is billed in INR, everywhere else in USD. Staff choose it on the call and it is stored on the lead,
-- so the charge currency is never guessed from an IP address. Existing rows default to USD because every
-- customer captured so far is outside India.
CREATE TYPE "public"."billing_currency" AS ENUM('USD', 'INR');--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "currency" "billing_currency" DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "currency" "billing_currency" DEFAULT 'USD' NOT NULL;