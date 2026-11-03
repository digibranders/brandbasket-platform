ALTER TABLE "report_sources" DROP CONSTRAINT "report_sources_status_check";--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "google_slot" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "measurement_id" text;--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "provisioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "second_owner_ok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "report_sources" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_detail_check" CHECK ("report_sources"."detail" is null or char_length("report_sources"."detail") <= 300);--> statement-breakpoint
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_slot_check" CHECK ("report_sources"."google_slot" >= 1);--> statement-breakpoint
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_measurement_id_check" CHECK ("report_sources"."measurement_id" is null or "report_sources"."measurement_id" ~ '^G-[A-Z0-9]{4,20}$');--> statement-breakpoint
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_status_check" CHECK ("report_sources"."status" in ('pending', 'awaiting_setup', 'connected', 'access_lost', 'removed'));--> statement-breakpoint
-- The go live job (staff connection) keeps these up to date. The customer's table level SELECT already covers the new columns.
GRANT UPDATE (google_slot, measurement_id, verified_at, provisioned_at, second_owner_ok, detail) ON report_sources TO bb_staff;
