-- The categories a business lists in besides its main one (up to three): it then also shows on those categories' list
-- pages in its area, and its leads are counted per category. drizzle-kit's DDL, then the grants and row-level security
-- in the pattern of 0087: the customer reads its own rows and writes nothing, every write runs on the staff connection.

CREATE TABLE "directory_business_categories" (
	"business_id" uuid NOT NULL,
	"category_slug" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_business_categories_business_id_category_slug_pk" PRIMARY KEY("business_id","category_slug"),
	CONSTRAINT "directory_business_categories_slug_check" CHECK (char_length("directory_business_categories"."category_slug") between 1 and 100 and "directory_business_categories"."category_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "directory_business_categories_position_check" CHECK ("directory_business_categories"."position" between 0 and 2)
);
--> statement-breakpoint
ALTER TABLE "directory_business_categories" ADD CONSTRAINT "directory_business_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT SELECT ON directory_business_categories TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_business_categories TO bb_staff;
--> statement-breakpoint
ALTER TABLE directory_business_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_business_categories_tenant_read ON directory_business_categories FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY directory_business_categories_staff_all ON directory_business_categories FOR ALL TO bb_staff USING (true) WITH CHECK (true);
