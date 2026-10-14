-- The day each invoiced payment was made (D16), and when this database started issuing invoices (D17). tax_invoices is
-- empty in production; any local rows take their payment's Indian date.
CREATE TABLE "tax_invoicing_start" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_invoicing_start_single_row_check" CHECK ("tax_invoicing_start"."id")
);
--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "paid_on" date;--> statement-breakpoint
UPDATE "tax_invoices" SET "paid_on" = ("payments"."paid_at" AT TIME ZONE 'Asia/Kolkata')::date FROM "payments" WHERE "payments"."id" = "tax_invoices"."payment_id";--> statement-breakpoint
UPDATE "tax_invoices" SET "paid_on" = "issued_on" WHERE "paid_on" IS NULL OR "paid_on" > "issued_on";--> statement-breakpoint
ALTER TABLE "tax_invoices" ALTER COLUMN "paid_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_paid_on_check" CHECK ("tax_invoices"."paid_on" <= "tax_invoices"."issued_on");--> statement-breakpoint
INSERT INTO "tax_invoicing_start" DEFAULT VALUES;--> statement-breakpoint
GRANT SELECT ON tax_invoicing_start TO fynix_staff;--> statement-breakpoint
ALTER TABLE tax_invoicing_start ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tax_invoicing_start_staff_select ON tax_invoicing_start FOR SELECT TO fynix_staff USING (true);
