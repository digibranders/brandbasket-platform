import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "blog_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "blog_authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"bio" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "blog_posts" ADD COLUMN "category_id" integer;
  ALTER TABLE "blog_posts" ADD COLUMN "author_id" integer;
  ALTER TABLE "blog_posts" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "blog_posts" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "blog_posts" ADD COLUMN "no_index" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "blog_categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "blog_authors_id" integer;
  CREATE INDEX "blog_categories_business_id_idx" ON "blog_categories" USING btree ("business_id");
  CREATE INDEX "blog_categories_updated_at_idx" ON "blog_categories" USING btree ("updated_at");
  CREATE INDEX "blog_categories_created_at_idx" ON "blog_categories" USING btree ("created_at");
  CREATE INDEX "blog_authors_business_id_idx" ON "blog_authors" USING btree ("business_id");
  CREATE INDEX "blog_authors_updated_at_idx" ON "blog_authors" USING btree ("updated_at");
  CREATE INDEX "blog_authors_created_at_idx" ON "blog_authors" USING btree ("created_at");
  ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_blog_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."blog_authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blog_categories_fk" FOREIGN KEY ("blog_categories_id") REFERENCES "public"."blog_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blog_authors_fk" FOREIGN KEY ("blog_authors_id") REFERENCES "public"."blog_authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "blog_posts_category_idx" ON "blog_posts" USING btree ("category_id");
  CREATE INDEX "blog_posts_author_idx" ON "blog_posts" USING btree ("author_id");
  CREATE INDEX "payload_locked_documents_rels_blog_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("blog_categories_id");
  CREATE INDEX "payload_locked_documents_rels_blog_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("blog_authors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "blog_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "blog_authors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "blog_categories" CASCADE;
  DROP TABLE "blog_authors" CASCADE;
  ALTER TABLE "blog_posts" DROP CONSTRAINT "blog_posts_category_id_blog_categories_id_fk";
  
  ALTER TABLE "blog_posts" DROP CONSTRAINT "blog_posts_author_id_blog_authors_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_blog_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_blog_authors_fk";
  
  DROP INDEX "blog_posts_category_idx";
  DROP INDEX "blog_posts_author_idx";
  DROP INDEX "payload_locked_documents_rels_blog_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_blog_authors_id_idx";
  ALTER TABLE "blog_posts" DROP COLUMN "category_id";
  ALTER TABLE "blog_posts" DROP COLUMN "author_id";
  ALTER TABLE "blog_posts" DROP COLUMN "meta_title";
  ALTER TABLE "blog_posts" DROP COLUMN "meta_description";
  ALTER TABLE "blog_posts" DROP COLUMN "no_index";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "blog_categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "blog_authors_id";`)
}
