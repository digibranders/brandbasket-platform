-- Staff-placed ads that lead to a web address instead of a business's page, and pictures staff upload for them
-- (docs/superpowers/specs/2026-10-12-staff-link-ads-design.md). A link ad has no listing key, so listing_key is optional;
-- exactly one of listing_key and link_url is set. drizzle-kit's DDL, unchanged; the grants and row-level security follow it.
CREATE TABLE "directory_staff_ad_pictures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "directory_staff_ad_pictures_storage_key_check" CHECK ("directory_staff_ad_pictures"."storage_key" = 'staff-ads/' || "directory_staff_ad_pictures"."id" || '/display'),
	CONSTRAINT "directory_staff_ad_pictures_size_check" CHECK ("directory_staff_ad_pictures"."bytes" > 0 and "directory_staff_ad_pictures"."width" > 0 and "directory_staff_ad_pictures"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "directory_staff_ads" DROP CONSTRAINT "directory_staff_ads_listing_key_check";--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ALTER COLUMN "listing_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD COLUMN "picture_id" uuid;--> statement-breakpoint
ALTER TABLE "directory_staff_ad_pictures" ADD CONSTRAINT "directory_staff_ad_pictures_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_picture_id_directory_staff_ad_pictures_id_fk" FOREIGN KEY ("picture_id") REFERENCES "public"."directory_staff_ad_pictures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_link_url_check" CHECK ("directory_staff_ads"."link_url" is null or (char_length("directory_staff_ads"."link_url") between 12 and 500 and "directory_staff_ads"."link_url" ~ '^https?://[^[:space:]]+$'));--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_target_check" CHECK (("directory_staff_ads"."listing_key" is null) <> ("directory_staff_ads"."link_url" is null));--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_listing_key_check" CHECK ("directory_staff_ads"."listing_key" is null or (char_length("directory_staff_ads"."listing_key") <= 200 and "directory_staff_ads"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'));
--> statement-breakpoint
-- Staff only, like directory_staff_ads (0067): the customer role and webfold_public get nothing. No DELETE: a picture
-- whose ads are all taken down is marked removed and its file deleted, so what ran stays on record. link_url needs no
-- new grant: the table's own (0067) cover the new column.
GRANT SELECT, INSERT, UPDATE ON directory_staff_ad_pictures TO webfold_staff;
--> statement-breakpoint
ALTER TABLE directory_staff_ad_pictures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_staff_ad_pictures_staff_all ON directory_staff_ad_pictures FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
