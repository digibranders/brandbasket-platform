import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "blog_categories" ADD COLUMN "description" varchar;
  ALTER TABLE "blog_categories" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "blog_categories" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "photo_id" integer;
  ALTER TABLE "blog_authors" ADD COLUMN "role" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "website" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "instagram" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "facebook" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "linkedin" varchar;
  ALTER TABLE "blog_authors" ADD COLUMN "x" varchar;
  ALTER TABLE "blog_posts" ADD COLUMN "cover_image_alt" varchar;
  ALTER TABLE "blog_authors" ADD CONSTRAINT "blog_authors_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "blog_authors_photo_idx" ON "blog_authors" USING btree ("photo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "blog_authors" DROP CONSTRAINT "blog_authors_photo_id_media_id_fk";
  
  DROP INDEX "blog_authors_photo_idx";
  ALTER TABLE "blog_categories" DROP COLUMN "description";
  ALTER TABLE "blog_categories" DROP COLUMN "meta_title";
  ALTER TABLE "blog_categories" DROP COLUMN "meta_description";
  ALTER TABLE "blog_authors" DROP COLUMN "photo_id";
  ALTER TABLE "blog_authors" DROP COLUMN "role";
  ALTER TABLE "blog_authors" DROP COLUMN "website";
  ALTER TABLE "blog_authors" DROP COLUMN "instagram";
  ALTER TABLE "blog_authors" DROP COLUMN "facebook";
  ALTER TABLE "blog_authors" DROP COLUMN "linkedin";
  ALTER TABLE "blog_authors" DROP COLUMN "x";
  ALTER TABLE "blog_posts" DROP COLUMN "cover_image_alt";`)
}
