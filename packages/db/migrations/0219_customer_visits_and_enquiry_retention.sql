ALTER TABLE "enquiries" ADD COLUMN "retain_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "details_erased_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "enquiries_retain_until_idx" ON "enquiries" USING btree ("retain_until") WHERE "enquiries"."retain_until" is not null and "enquiries"."details_erased_at" is null;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_retain_until_check" CHECK ("enquiries"."retain_until" is null or "enquiries"."retain_until" > "enquiries"."received_at");--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_erased_check" CHECK ("enquiries"."details_erased_at" is null or ("enquiries"."name" is null and "enquiries"."phone" is null and "enquiries"."email" is null and "enquiries"."message" is null));
--> statement-breakpoint
-- Website visits for the customer app (plan 61, gate G1): the customer reads their own rolled-up numbers and the lists
-- they come from. The jobs and the console keep writing on the staff connection. The rows are
-- read only when the app's CUSTOMER_VISITS_ENABLED switch is on; the policy only opens the business's own rows to it.
GRANT SELECT ON metric_daily, metric_breakdowns TO bb_app;
--> statement-breakpoint
CREATE POLICY metric_daily_tenant_select ON metric_daily FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY metric_breakdowns_tenant_select ON metric_breakdowns FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
-- Form contents (gate G2): staff-side erasure of an enquirer's details stamps details_erased_at. Nothing stores the contents
-- unless ENQUIRY_FORM_CONTENTS_ENABLED is on.
GRANT UPDATE (details_erased_at) ON enquiries TO bb_staff;
