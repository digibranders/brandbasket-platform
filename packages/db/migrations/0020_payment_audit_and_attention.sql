-- Two additions to payments, both from the 2026-09-16 security review.
--
-- 1. Attention. A correctly signed confirmation can arrive for a checkout we had already replaced or cancelled, for a
--    business that already has access, or for an amount that is not the plan's; the provider has taken the money
--    either way. Such a payment is now recorded (status captured) with an attention_reason and activates nothing, so
--    staff can refund or apply it. A payment whose follow-on submission failed is flagged the same way. Existing rows
--    get no reason: nothing recorded so far needed attention.
-- 2. The manual payment audit trail: who recorded it, the bank or payment reference, and the date the money arrived.
--    Manual payments recorded before this migration have no reference or date on file, so they are backfilled with a
--    placeholder reference that says so and the UTC date they were recorded; their recorder cannot be recovered,
--    which is why payments_manual_recorded_by_check is added NOT VALID (it binds every new or updated row, and skips
--    the old ones). When this was written the dev database held no payments at all.
CREATE TYPE "public"."payment_attention_reason" AS ENUM('checkout_replaced', 'already_paid', 'amount_mismatch', 'submission_failed');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attention_reason" "payment_attention_reason";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attention_raised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attention_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attention_resolved_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "manual_reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "received_on" date;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_attention_resolved_by_staff_id_users_id_fk" FOREIGN KEY ("attention_resolved_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_staff_id_users_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_needing_attention_idx" ON "payments" USING btree ("attention_raised_at") WHERE "payments"."attention_reason" is not null and "payments"."attention_resolved_at" is null;--> statement-breakpoint
UPDATE "payments"
SET "manual_reference" = 'Not recorded (entered before references were required)',
    "received_on" = (coalesce("payments"."paid_at", "payments"."created_at") AT TIME ZONE 'UTC')::date
WHERE "payments"."provider" = 'manual' AND "payments"."manual_reference" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_attention_raised_check" CHECK (("payments"."attention_reason" is null) = ("payments"."attention_raised_at" is null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_attention_resolved_check" CHECK (("payments"."attention_resolved_at" is null) = ("payments"."attention_resolved_by_staff_id" is null) and ("payments"."attention_resolved_at" is null or "payments"."attention_reason" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_manual_details_check" CHECK (case when "payments"."provider" = 'manual' then "payments"."manual_reference" is not null and "payments"."received_on" is not null else "payments"."manual_reference" is null and "payments"."received_on" is null and "payments"."recorded_by_staff_id" is null end);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_manual_reference_check" CHECK ("payments"."manual_reference" is null or (char_length("payments"."manual_reference") between 1 and 100 and "payments"."manual_reference" = btrim("payments"."manual_reference")));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_manual_recorded_by_check" CHECK ("payments"."provider" <> 'manual' or "payments"."recorded_by_staff_id" is not null) NOT VALID;
