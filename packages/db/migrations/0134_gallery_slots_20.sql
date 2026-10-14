-- The gallery grows from six photos to twenty (2026-10-12): gallery_7 to gallery_20 join the picture slots, beside the
-- gallery_1 to gallery_6 that 0087 added. They are values of the same enum on the same table, so the grants and
-- row-level security that cover directory_pictures already cover them.

ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_7';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_8';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_9';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_10';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_11';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_12';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_13';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_14';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_15';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_16';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_17';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_18';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_19';--> statement-breakpoint
ALTER TYPE "public"."directory_picture_slot" ADD VALUE 'gallery_20';
