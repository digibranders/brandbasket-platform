-- The local directory's ratings, reviews and enquiries (docs/superpowers/specs/2026-09-29-directory-reviews-
-- enquiries-design.md). drizzle-kit's DDL, unchanged; the grants and row-level security are in 0055.
CREATE TYPE "public"."directory_enquiry_kind" AS ENUM('business', 'top_list');--> statement-breakpoint
CREATE TYPE "public"."directory_enquiry_status" AS ENUM('new', 'handled');--> statement-breakpoint
CREATE TYPE "public"."directory_review_status" AS ENUM('published', 'hidden');--> statement-breakpoint
CREATE TABLE "directory_enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_key" text,
	"business_name" text,
	"service_label" text NOT NULL,
	"area_label" text NOT NULL,
	"kind" "directory_enquiry_kind" NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"message" text,
	"status" "directory_enquiry_status" DEFAULT 'new' NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_enquiries_listing_key_check" CHECK ("directory_enquiries"."listing_key" is null or (char_length("directory_enquiries"."listing_key") <= 200 and "directory_enquiries"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$')),
	CONSTRAINT "directory_enquiries_business_name_check" CHECK ("directory_enquiries"."business_name" is null or char_length("directory_enquiries"."business_name") between 1 and 200),
	CONSTRAINT "directory_enquiries_kind_check" CHECK (("directory_enquiries"."kind" = 'business' and "directory_enquiries"."listing_key" is not null and "directory_enquiries"."business_name" is not null) or ("directory_enquiries"."kind" = 'top_list' and "directory_enquiries"."listing_key" is null and "directory_enquiries"."business_name" is null)),
	CONSTRAINT "directory_enquiries_service_label_check" CHECK (char_length("directory_enquiries"."service_label") between 1 and 120),
	CONSTRAINT "directory_enquiries_area_label_check" CHECK (char_length("directory_enquiries"."area_label") between 1 and 120),
	CONSTRAINT "directory_enquiries_name_check" CHECK (char_length("directory_enquiries"."name") between 1 and 60),
	CONSTRAINT "directory_enquiries_phone_check" CHECK ("directory_enquiries"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_enquiries_message_check" CHECK ("directory_enquiries"."message" is null or char_length("directory_enquiries"."message") between 1 and 500),
	CONSTRAINT "directory_enquiries_handled_check" CHECK (("directory_enquiries"."status" = 'handled' and "directory_enquiries"."handled_at" is not null) or ("directory_enquiries"."status" = 'new' and "directory_enquiries"."handled_at" is null and "directory_enquiries"."handled_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "directory_review_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_key" text NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_review_otps_listing_key_check" CHECK (char_length("directory_review_otps"."listing_key") <= 200 and "directory_review_otps"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_review_otps_phone_check" CHECK ("directory_review_otps"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_review_otps_code_hash_check" CHECK (char_length("directory_review_otps"."code_hash") > 0),
	CONSTRAINT "directory_review_otps_attempts_check" CHECK ("directory_review_otps"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "directory_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_key" text NOT NULL,
	"business_name" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"phone" text NOT NULL,
	"rating" integer NOT NULL,
	"text" text,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "directory_review_status" DEFAULT 'published' NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_reviews_listing_key_phone_key" UNIQUE("listing_key","phone"),
	CONSTRAINT "directory_reviews_listing_key_check" CHECK (char_length("directory_reviews"."listing_key") <= 200 and "directory_reviews"."listing_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$'),
	CONSTRAINT "directory_reviews_business_name_check" CHECK (char_length("directory_reviews"."business_name") between 1 and 200),
	CONSTRAINT "directory_reviews_reviewer_name_check" CHECK (char_length("directory_reviews"."reviewer_name") between 1 and 60),
	CONSTRAINT "directory_reviews_phone_check" CHECK ("directory_reviews"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_reviews_rating_check" CHECK ("directory_reviews"."rating" between 1 and 5),
	CONSTRAINT "directory_reviews_text_check" CHECK ("directory_reviews"."text" is null or char_length("directory_reviews"."text") between 1 and 500),
	CONSTRAINT "directory_reviews_highlights_check" CHECK (cardinality("directory_reviews"."highlights") <= 2 and "directory_reviews"."highlights" <@ ARRAY['good_service', 'value_for_money', 'friendly_staff', 'clean', 'on_time', 'quality', 'expert', 'quick_response']::text[] and (cardinality("directory_reviews"."highlights") < 2 or "directory_reviews"."highlights"[1] <> "directory_reviews"."highlights"[2])),
	CONSTRAINT "directory_reviews_hidden_check" CHECK (("directory_reviews"."status" = 'hidden' and "directory_reviews"."hidden_at" is not null) or ("directory_reviews"."status" = 'published' and "directory_reviews"."hidden_at" is null and "directory_reviews"."hidden_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD CONSTRAINT "directory_enquiries_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_enquiries_status_created_at_idx" ON "directory_enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "directory_review_otps_expires_at_idx" ON "directory_review_otps" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "directory_reviews_listing_key_created_at_idx" ON "directory_reviews" USING btree ("listing_key","created_at");--> statement-breakpoint
CREATE INDEX "directory_reviews_created_at_idx" ON "directory_reviews" USING btree ("created_at");