-- Business videos move from our own storage (R2, migrations 0105 and 0106, never released) to Vimeo. A video kept in R2 has no
-- Vimeo id and cannot be converted, and nothing from R2 is on production, so any such rows (only ever on a development database)
-- go first; the new vimeo_id column has no default.
DELETE FROM "directory_videos";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP CONSTRAINT "directory_videos_keys_check";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP CONSTRAINT "directory_videos_size_check";--> statement-breakpoint
ALTER TABLE "directory_videos" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_videos" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_videos" ALTER COLUMN "duration_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_videos" ADD COLUMN "vimeo_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_videos" ADD COLUMN "vimeo_hash" text;--> statement-breakpoint
ALTER TABLE "directory_videos" ADD COLUMN "poster_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_videos_vimeo_id_idx" ON "directory_videos" USING btree ("vimeo_id") WHERE "directory_videos"."removed_at" is null;--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "video_key";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "poster_key";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "video_mime_type";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "poster_mime_type";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "poster_bytes";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "sha256";--> statement-breakpoint
ALTER TABLE "directory_videos" DROP COLUMN "poster_sha256";--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_vimeo_id_check" CHECK ("directory_videos"."vimeo_id" ~ '^[0-9]{1,20}$');--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_hash_check" CHECK ("directory_videos"."vimeo_hash" is null or "directory_videos"."vimeo_hash" ~ '^[0-9a-f]{6,32}$');--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_poster_check" CHECK ("directory_videos"."poster_url" is null or "directory_videos"."poster_url" like 'https://i.vimeocdn.com/%');--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_ready_check" CHECK (("directory_videos"."width" is null) = ("directory_videos"."height" is null) and ("directory_videos"."width" is null) = ("directory_videos"."duration_ms" is null) and ("directory_videos"."width" is null or ("directory_videos"."width" > 0 and "directory_videos"."height" > 0 and "directory_videos"."duration_ms" > 0)));--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_live_check" CHECK ("directory_videos"."status" <> 'approved' or ("directory_videos"."vimeo_hash" is not null and "directory_videos"."poster_url" is not null and "directory_videos"."width" is not null));--> statement-breakpoint
ALTER TABLE "directory_videos" ADD CONSTRAINT "directory_videos_size_check" CHECK ("directory_videos"."bytes" > 0);