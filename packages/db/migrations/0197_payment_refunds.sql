ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_by_staff_id_users_id_fk" FOREIGN KEY ("refunded_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_details_check" CHECK (("payments"."refunded_at" is null) = ("payments"."refunded_by_staff_id" is null) and ("payments"."refunded_at" is null) = ("payments"."refunded_amount_cents" is null) and ("payments"."refunded_at" is null) = ("payments"."refund_reason" is null) and ("payments"."refunded_at" is null or "payments"."status" = 'refunded'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_amount_check" CHECK ("payments"."refunded_amount_cents" is null or "payments"."refunded_amount_cents" between 1 and "payments"."amount_cents");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_reason_check" CHECK ("payments"."refund_reason" is null or char_length("payments"."refund_reason") between 3 and 300);