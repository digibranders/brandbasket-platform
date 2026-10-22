-- An add-on can be added to a running Managed Website plan (docs/plans/13-platform-add-ons-after-signup.md in the
-- BrandBasket workspace): a charge for the rest of the paid month, then it joins the plan's monthly amount at the next
-- renewal. The add-on row links that charge and says when its price became part of the monthly amount (billed_from).
-- An add-on can be taken again after an earlier one stopped, so only live rows are unique per subscription.
ALTER TYPE "public"."charge_kind" ADD VALUE 'add_on';--> statement-breakpoint
ALTER TYPE "public"."payment_attention_reason" ADD VALUE 'add_on_not_applied';--> statement-breakpoint
ALTER TYPE "public"."payment_attention_reason" ADD VALUE 'add_on_provider_pending';--> statement-breakpoint
DROP INDEX "bundled_add_ons_subscription_add_on_idx";--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "charge_id" uuid;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "quoted_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "billed_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "provider_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "added_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_added_by_staff_id_users_id_fk" FOREIGN KEY ("added_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundled_add_ons_charge_idx" ON "bundled_add_ons" USING btree ("charge_id") WHERE "bundled_add_ons"."charge_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "bundled_add_ons_subscription_add_on_idx" ON "bundled_add_ons" USING btree ("subscription_id","add_on") WHERE "bundled_add_ons"."status" in ('pending', 'active');;--> statement-breakpoint
-- Every add-on already active was taken at sign-up and billed from its first payment.
UPDATE "bundled_add_ons" SET "billed_from" = "activated_at" WHERE "status" = 'active' AND "billed_from" IS NULL;
