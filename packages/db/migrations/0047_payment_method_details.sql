ALTER TABLE "payments" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_network" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_type" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_issuer" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "upi_vpa" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_card_last4_check" CHECK ("payments"."card_last4" is null or "payments"."card_last4" ~ '^[0-9]{4}$');