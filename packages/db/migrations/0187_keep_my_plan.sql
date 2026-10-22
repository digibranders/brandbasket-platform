DROP INDEX "subscriptions_one_live_per_business_idx";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "continues_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_continues_id_fk" FOREIGN KEY ("continues_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_successor_idx" ON "subscriptions" USING btree ("continues_id") WHERE "subscriptions"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_business_idx" ON "subscriptions" USING btree ("business_id") WHERE "subscriptions"."status" <> 'cancelled' and "subscriptions"."continues_id" is null;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_keep_check" CHECK (("subscriptions"."continues_id" is null) = ("subscriptions"."start_at" is null));