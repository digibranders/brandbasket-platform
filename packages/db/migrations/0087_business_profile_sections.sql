-- The Business profile's sections beyond Details (the owner's spec sheet: Identity, Services, Products, Photos,
-- Customer conversion, Reviews, Promotions, Trust): more columns on the profile row, a services table and a products
-- table, and the picture slots for the banner and the gallery. drizzle-kit's DDL, then the grants and row-level
-- security for the two new tables in the same pattern as 0081: the customer reads its own rows and writes nothing,
-- every write runs on the staff connection after the platform has checked the customer, webfold_public gets nothing.
-- directory_business_profiles' own grants (0081) cover its new columns.

ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'banner';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_1';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_2';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_3';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_4';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_5';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_6';--> statement-breakpoint
CREATE TABLE "directory_business_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_inr" integer,
	"category" text,
	"availability" text DEFAULT 'in_stock' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_business_products_name_check" CHECK (char_length("name") between 1 and 80 and "name" = btrim("name") and "name" !~ '[\r\n]'),
	CONSTRAINT "directory_business_products_description_check" CHECK ("directory_business_products"."description" is null or (char_length("directory_business_products"."description") between 1 and 300 and "directory_business_products"."description" = btrim("directory_business_products"."description"))),
	CONSTRAINT "directory_business_products_price_check" CHECK ("directory_business_products"."price_inr" is null or "directory_business_products"."price_inr" between 0 and 10000000),
	CONSTRAINT "directory_business_products_category_check" CHECK ("directory_business_products"."category" is null or (char_length("directory_business_products"."category") between 1 and 60 and "directory_business_products"."category" = btrim("directory_business_products"."category") and "directory_business_products"."category" !~ '[\r\n]')),
	CONSTRAINT "directory_business_products_availability_check" CHECK ("directory_business_products"."availability" in ('in_stock', 'out_of_stock', 'made_to_order')),
	CONSTRAINT "directory_business_products_position_check" CHECK ("directory_business_products"."position" between 0 and 40)
);
--> statement-breakpoint
CREATE TABLE "directory_business_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_inr" integer,
	"duration_minutes" smallint,
	"service_area" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_business_services_category_check" CHECK (char_length("category") between 1 and 60 and "category" = btrim("category") and "category" !~ '[\r\n]'),
	CONSTRAINT "directory_business_services_name_check" CHECK (char_length("name") between 1 and 80 and "name" = btrim("name") and "name" !~ '[\r\n]'),
	CONSTRAINT "directory_business_services_description_check" CHECK ("directory_business_services"."description" is null or (char_length("directory_business_services"."description") between 1 and 300 and "directory_business_services"."description" = btrim("directory_business_services"."description"))),
	CONSTRAINT "directory_business_services_price_check" CHECK ("directory_business_services"."price_inr" is null or "directory_business_services"."price_inr" between 0 and 10000000),
	CONSTRAINT "directory_business_services_duration_check" CHECK ("directory_business_services"."duration_minutes" is null or "directory_business_services"."duration_minutes" between 1 and 1440),
	CONSTRAINT "directory_business_services_area_check" CHECK ("directory_business_services"."service_area" is null or (char_length("directory_business_services"."service_area") between 1 and 120 and "directory_business_services"."service_area" = btrim("directory_business_services"."service_area") and "directory_business_services"."service_area" !~ '[\r\n]')),
	CONSTRAINT "directory_business_services_position_check" CHECK ("directory_business_services"."position" between 0 and 40)
);
--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "established_year" smallint;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "service_area" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "directions_note" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "instagram_url" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "holiday_hours" text;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "open_24x7" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "contact_options" text[] DEFAULT ARRAY['call','whatsapp','directions','website']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "payment_methods" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD COLUMN "licences" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_business_products" ADD CONSTRAINT "directory_business_products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_business_services" ADD CONSTRAINT "directory_business_services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_business_products_business_id_idx" ON "directory_business_products" USING btree ("business_id","position");--> statement-breakpoint
CREATE INDEX "directory_business_services_business_id_idx" ON "directory_business_services" USING btree ("business_id","position");--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_established_year_check" CHECK ("directory_business_profiles"."established_year" is null or "directory_business_profiles"."established_year" between 1800 and 2100);--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_service_area_check" CHECK ("directory_business_profiles"."service_area" is null or (char_length("directory_business_profiles"."service_area") between 1 and 200 and "directory_business_profiles"."service_area" = btrim("directory_business_profiles"."service_area") and "directory_business_profiles"."service_area" !~ '[\r\n]'));--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_email_check" CHECK ("directory_business_profiles"."email" is null or (char_length("directory_business_profiles"."email") <= 120 and "directory_business_profiles"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_directions_note_check" CHECK ("directory_business_profiles"."directions_note" is null or (char_length("directory_business_profiles"."directions_note") between 1 and 200 and "directory_business_profiles"."directions_note" = btrim("directory_business_profiles"."directions_note") and "directory_business_profiles"."directions_note" !~ '[\r\n]'));--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_social_check" CHECK (("directory_business_profiles"."instagram_url" is null or (char_length("directory_business_profiles"."instagram_url") <= 300 and "directory_business_profiles"."instagram_url" ~ '^https://[^[:space:]]+$')) and ("directory_business_profiles"."facebook_url" is null or (char_length("directory_business_profiles"."facebook_url") <= 300 and "directory_business_profiles"."facebook_url" ~ '^https://[^[:space:]]+$')) and ("directory_business_profiles"."linkedin_url" is null or (char_length("directory_business_profiles"."linkedin_url") <= 300 and "directory_business_profiles"."linkedin_url" ~ '^https://[^[:space:]]+$')));--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_holiday_hours_check" CHECK ("directory_business_profiles"."holiday_hours" is null or (char_length("directory_business_profiles"."holiday_hours") between 1 and 200 and "directory_business_profiles"."holiday_hours" = btrim("directory_business_profiles"."holiday_hours") and "directory_business_profiles"."holiday_hours" !~ '[\r\n]'));--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_contact_options_check" CHECK ("directory_business_profiles"."contact_options" <@ ARRAY['call','whatsapp','enquiry','appointment','booking','quote','directions','website']::text[]);--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_payment_methods_check" CHECK ("directory_business_profiles"."payment_methods" <@ ARRAY['cash','upi','card','net_banking','cheque','emi']::text[]);--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_licences_check" CHECK (cardinality("directory_business_profiles"."licences") <= 10 and char_length(array_to_string("directory_business_profiles"."licences", E'\n')) <= 1010);
--> statement-breakpoint
GRANT SELECT ON directory_business_services, directory_business_products TO webfold_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_business_services, directory_business_products TO webfold_staff;
--> statement-breakpoint
ALTER TABLE directory_business_services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE directory_business_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_business_services_tenant_read ON directory_business_services FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY directory_business_products_tenant_read ON directory_business_products FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY directory_business_services_staff_all ON directory_business_services FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY directory_business_products_staff_all ON directory_business_products FOR ALL TO webfold_staff USING (true) WITH CHECK (true);
