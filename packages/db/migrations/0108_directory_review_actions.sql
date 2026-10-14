CREATE TABLE "directory_review_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"commenter_name" text NOT NULL,
	"phone" text NOT NULL,
	"text" text NOT NULL,
	"status" "directory_review_status" DEFAULT 'published' NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_review_comments_commenter_name_check" CHECK (char_length("directory_review_comments"."commenter_name") between 1 and 60),
	CONSTRAINT "directory_review_comments_phone_check" CHECK ("directory_review_comments"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "directory_review_comments_text_check" CHECK (char_length("directory_review_comments"."text") between 1 and 300),
	CONSTRAINT "directory_review_comments_hidden_check" CHECK (("directory_review_comments"."status" = 'hidden' and "directory_review_comments"."hidden_at" is not null) or ("directory_review_comments"."status" = 'published' and "directory_review_comments"."hidden_at" is null and "directory_review_comments"."hidden_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_review_otps" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD COLUMN "helpful_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_review_id_directory_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."directory_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_review_comments" ADD CONSTRAINT "directory_review_comments_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_review_comments_review_id_created_at_idx" ON "directory_review_comments" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "directory_review_comments_created_at_idx" ON "directory_review_comments" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "directory_review_otps" ADD CONSTRAINT "directory_review_otps_review_id_directory_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."directory_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_helpful_count_check" CHECK ("directory_reviews"."helpful_count" >= 0);