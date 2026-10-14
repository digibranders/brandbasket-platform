CREATE TYPE "public"."geo_district_status" AS ENUM('live', 'soon', 'off');--> statement-breakpoint
CREATE TYPE "public"."geo_item_status" AS ENUM('on', 'off');--> statement-breakpoint
CREATE TABLE "geo_areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"district_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city_slug" text NOT NULL,
	"city_name" text NOT NULL,
	"pincodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"status" "geo_item_status" DEFAULT 'on' NOT NULL,
	"slug_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_areas_district_slug_key" UNIQUE("district_id","slug"),
	CONSTRAINT "geo_areas_slug_check" CHECK ("geo_areas"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "geo_areas_city_slug_check" CHECK ("geo_areas"."city_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "geo_areas_name_check" CHECK (char_length("geo_areas"."name") between 1 and 80 and char_length("geo_areas"."city_name") between 1 and 80),
	CONSTRAINT "geo_areas_pincodes_check" CHECK (array_to_string("geo_areas"."pincodes", ',') ~ '^([1-9][0-9]{5}(,[1-9][0-9]{5})*)?$'),
	CONSTRAINT "geo_areas_point_check" CHECK (("geo_areas"."lat" is null) = ("geo_areas"."lon" is null) and ("geo_areas"."lat" is null or ("geo_areas"."lat" between -90 and 90 and "geo_areas"."lon" between -180 and 180)))
);
--> statement-breakpoint
CREATE TABLE "geo_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"singular" text NOT NULL,
	"parent_slug" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"taxonomy_id" text,
	"has_page" boolean DEFAULT false NOT NULL,
	"status" "geo_item_status" DEFAULT 'on' NOT NULL,
	"slug_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_categories_slug_key" UNIQUE("slug"),
	CONSTRAINT "geo_categories_slug_check" CHECK ("geo_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "geo_categories_parent_check" CHECK ("geo_categories"."parent_slug" is null or ("geo_categories"."parent_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and "geo_categories"."parent_slug" <> "geo_categories"."slug")),
	CONSTRAINT "geo_categories_label_check" CHECK (char_length("geo_categories"."label") between 1 and 80 and char_length("geo_categories"."singular") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "geo_districts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "geo_district_status" DEFAULT 'off' NOT NULL,
	"slug_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_districts_state_slug_key" UNIQUE("state_code","slug"),
	CONSTRAINT "geo_districts_state_code_check" CHECK ("geo_districts"."state_code" ~ '^[a-z]{2}$'),
	CONSTRAINT "geo_districts_slug_check" CHECK ("geo_districts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "geo_districts_name_check" CHECK (char_length("geo_districts"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "geo_areas" ADD CONSTRAINT "geo_areas_district_id_geo_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."geo_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_areas_district_id_idx" ON "geo_areas" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "geo_categories_parent_slug_idx" ON "geo_categories" USING btree ("parent_slug");