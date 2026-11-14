CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"prefix" text DEFAULT 'CN' NOT NULL,
	"financial_year" text NOT NULL,
	"serial" integer NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"supplier" jsonb NOT NULL,
	"recipient" jsonb NOT NULL,
	"place_of_supply_state_code" text NOT NULL,
	"supply_type" text NOT NULL,
	"lines" jsonb NOT NULL,
	"taxable_cents" integer NOT NULL,
	"cgst_cents" integer NOT NULL,
	"sgst_cents" integer NOT NULL,
	"igst_cents" integer NOT NULL,
	"round_off_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"refunded_amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_tax_check" CHECK (case "credit_notes"."supply_type"
        when 'intra_state' then "credit_notes"."igst_cents" = 0 and "credit_notes"."cgst_cents" = "credit_notes"."sgst_cents"
        when 'inter_state' then "credit_notes"."cgst_cents" = 0 and "credit_notes"."sgst_cents" = 0
        else false end),
	CONSTRAINT "credit_notes_number_check" CHECK ("credit_notes"."serial" between 1 and 999999 and "credit_notes"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$' and "credit_notes"."prefix" ~ '^[A-Z0-9]+$'
        and length("credit_notes"."number") <= 16
        and "credit_notes"."number" = "credit_notes"."prefix" || '/' || "credit_notes"."financial_year" || '/' || lpad("credit_notes"."serial"::text, 6, '0')),
	CONSTRAINT "credit_notes_total_check" CHECK ("credit_notes"."taxable_cents" >= 0 and "credit_notes"."cgst_cents" >= 0 and "credit_notes"."igst_cents" >= 0 and "credit_notes"."total_cents" > 0
        and "credit_notes"."total_cents" = "credit_notes"."taxable_cents" + "credit_notes"."cgst_cents" + "credit_notes"."sgst_cents" + "credit_notes"."igst_cents" + "credit_notes"."round_off_cents"),
	CONSTRAINT "credit_notes_amount_match_check" CHECK ("credit_notes"."total_cents" = "credit_notes"."refunded_amount_cents")
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_payment_id_idx" ON "credit_notes" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_idx" ON "credit_notes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_series_serial_idx" ON "credit_notes" USING btree ("prefix","financial_year","serial");--> statement-breakpoint
CREATE INDEX "credit_notes_business_id_idx" ON "credit_notes" USING btree ("business_id","issued_on");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
GRANT SELECT ON credit_notes TO bb_app;--> statement-breakpoint
GRANT SELECT, INSERT ON credit_notes TO bb_staff;--> statement-breakpoint
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY credit_notes_tenant_select ON credit_notes FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());--> statement-breakpoint
CREATE POLICY credit_notes_staff_select ON credit_notes FOR SELECT TO bb_staff USING (true);--> statement-breakpoint
CREATE POLICY credit_notes_staff_insert ON credit_notes FOR INSERT TO bb_staff WITH CHECK (true);