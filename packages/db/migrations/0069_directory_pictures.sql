-- A listing owner's own pictures on Firstfold Local (docs/superpowers/specs/2026-09-30-listing-pictures-crop-
-- design.md): the square photo beside its name, and its ad picture in the side column's two shapes. One approved
-- picture per business and slot, and at most one waiting for staff or refused. drizzle-kit's DDL, unchanged; grants and
-- row-level security are in 0070.
CREATE TYPE "public"."directory_picture_slot" AS ENUM('listing', 'ad_tall', 'ad_wide');--> statement-breakpoint
CREATE TYPE "public"."directory_picture_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "directory_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"slot" "directory_picture_slot" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" "directory_picture_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "directory_pictures_storage_key_check" CHECK ("directory_pictures"."storage_key" = 't/' || "directory_pictures"."business_id" || '/' || "directory_pictures"."id" || '/display'),
	CONSTRAINT "directory_pictures_size_check" CHECK ("directory_pictures"."bytes" > 0 and "directory_pictures"."width" > 0 and "directory_pictures"."height" > 0),
	CONSTRAINT "directory_pictures_decided_check" CHECK (("directory_pictures"."status" = 'pending') = ("directory_pictures"."decided_at" is null) and ("directory_pictures"."decided_at" is null) = ("directory_pictures"."decided_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_pictures" ADD CONSTRAINT "directory_pictures_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_pictures" ADD CONSTRAINT "directory_pictures_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_pictures" ADD CONSTRAINT "directory_pictures_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_pictures_one_live_per_slot_idx" ON "directory_pictures" USING btree ("business_id","slot") WHERE "directory_pictures"."status" = 'approved' and "directory_pictures"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_pictures_one_waiting_per_slot_idx" ON "directory_pictures" USING btree ("business_id","slot") WHERE "directory_pictures"."status" <> 'approved' and "directory_pictures"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "directory_pictures_status_created_at_idx" ON "directory_pictures" USING btree ("status","created_at") WHERE "directory_pictures"."removed_at" is null;