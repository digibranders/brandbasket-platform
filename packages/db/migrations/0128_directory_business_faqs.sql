CREATE TABLE "directory_business_faqs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_business_faqs_question_check" CHECK (char_length("question") between 1 and 150 and "question" = btrim("question") and "question" !~ '[\r\n]'),
	CONSTRAINT "directory_business_faqs_answer_check" CHECK (char_length("directory_business_faqs"."answer") between 1 and 600 and "directory_business_faqs"."answer" = btrim("directory_business_faqs"."answer")),
	CONSTRAINT "directory_business_faqs_position_check" CHECK ("directory_business_faqs"."position" between 0 and 20)
);
--> statement-breakpoint
ALTER TABLE "directory_business_profiles" DROP CONSTRAINT "directory_business_profiles_page_tabs_check";--> statement-breakpoint
ALTER TABLE "directory_business_faqs" ADD CONSTRAINT "directory_business_faqs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "directory_business_faqs_business_id_idx" ON "directory_business_faqs" USING btree ("business_id","position");--> statement-breakpoint
ALTER TABLE "directory_business_profiles" ADD CONSTRAINT "directory_business_profiles_page_tabs_check" CHECK ("directory_business_profiles"."page_tabs" <@ ARRAY['offers','services','products','trust','faq']::text[]);--> statement-breakpoint
-- The FAQ tab's rows follow the services and products tables (0087): the customer reads its own rows and writes
-- nothing; every write runs on the staff connection after the platform has checked the customer; fynix_public gets
-- nothing.
GRANT SELECT ON directory_business_faqs TO fynix_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_business_faqs TO fynix_staff;
--> statement-breakpoint
ALTER TABLE directory_business_faqs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_business_faqs_tenant_read ON directory_business_faqs FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY directory_business_faqs_staff_all ON directory_business_faqs FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
