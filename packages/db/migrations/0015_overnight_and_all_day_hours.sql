-- Overnight hours (a closing time earlier than the opening time) and 24-hour opening. Every existing row stays
-- valid: a closed row gets open_all_day = false, and an open row already has both times with opens_at < closes_at.
ALTER TABLE "business_hours" DROP CONSTRAINT "business_hours_open_times_check";--> statement-breakpoint
ALTER TABLE "business_hours" ADD COLUMN "open_all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_open_times_check" CHECK (("business_hours"."closed" and not "business_hours"."open_all_day")
        or ("business_hours"."open_all_day" and not "business_hours"."closed" and "business_hours"."opens_at" is null and "business_hours"."closes_at" is null)
        or (not "business_hours"."closed" and not "business_hours"."open_all_day" and "business_hours"."opens_at" is not null and "business_hours"."closes_at" is not null and "business_hours"."opens_at" <> "business_hours"."closes_at"));