CREATE TABLE "directory_videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"video_key" text NOT NULL,
	"poster_key" text NOT NULL,
	"video_mime_type" text NOT NULL,
	"poster_mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"poster_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"sha256" text NOT NULL,
	"poster_sha256" text NOT NULL,
	"status" "directory_picture_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "directory_videos_slot_check" CHECK ("directory_videos"."slot" between 1 and 3),
	CONSTRAINT "directory_videos_keys_check" CHECK ("directory_videos"."video_key" = 't/' || "directory_videos"."business_id" || '/' || "directory_videos"."id" || '/video' and "directory_videos"."poster_key" = 't/' || "directory_videos"."business_id" || '/' || "directory_videos"."id" || '/poster'),
	CONSTRAINT "directory_videos_size_check" CHECK ("directory_videos"."bytes" > 0 and "directory_videos"."poster_bytes" > 0 and "directory_videos"."width" > 0 and "directory_videos"."height" > 0 and "directory_videos"."duration_ms" > 0),
	CONSTRAINT "directory_videos_decided_check" CHECK (("directory_videos"."status" = 'pending') = ("directory_videos"."decided_at" is null) and ("directory_videos"."decided_at" is null) = ("directory_videos"."decided_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_videos_one_live_per_slot_idx" ON "directory_videos" USING btree ("business_id","slot") WHERE "directory_videos"."status" = 'approved' and "directory_videos"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_videos_one_waiting_per_slot_idx" ON "directory_videos" USING btree ("business_id","slot") WHERE "directory_videos"."status" <> 'approved' and "directory_videos"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "directory_videos_status_created_at_idx" ON "directory_videos" USING btree ("status","created_at") WHERE "directory_videos"."removed_at" is null;