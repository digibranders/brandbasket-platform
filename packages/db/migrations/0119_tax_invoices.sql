CREATE TABLE "billing_profiles" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"gstin" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"state_code" text NOT NULL,
	"email" text,
	"phone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_profiles_email_check" CHECK ("billing_profiles"."email" is null or (length("billing_profiles"."email") <= 254 and "billing_profiles"."email" like '%_@_%')),
	CONSTRAINT "billing_profiles_phone_check" CHECK ("billing_profiles"."phone" is null or "billing_profiles"."phone" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "billing_profiles_legal_name_check" CHECK (length(btrim("billing_profiles"."legal_name")) between 1 and 200),
	CONSTRAINT "billing_profiles_gstin_check" CHECK ("billing_profiles"."gstin" is null or "billing_profiles"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
	CONSTRAINT "billing_profiles_postal_code_check" CHECK ("billing_profiles"."postal_code" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "billing_profiles_state_code_check" CHECK ("billing_profiles"."state_code" ~ '^[a-z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "tax_invoice_series" (
	"prefix" text NOT NULL,
	"financial_year" text NOT NULL,
	"next_serial" integer NOT NULL,
	CONSTRAINT "tax_invoice_series_prefix_financial_year_pk" PRIMARY KEY("prefix","financial_year"),
	CONSTRAINT "tax_invoice_series_next_serial_check" CHECK ("tax_invoice_series"."next_serial" between 1 and 1000000),
	CONSTRAINT "tax_invoice_series_financial_year_check" CHECK ("tax_invoice_series"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "tax_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"financial_year" text NOT NULL,
	"serial" integer NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"supplier" jsonb NOT NULL,
	"recipient" jsonb NOT NULL,
	"place_of_supply_state_code" text NOT NULL,
	"place_of_supply_basis" text NOT NULL,
	"supply_type" text NOT NULL,
	"lines" jsonb NOT NULL,
	"taxable_cents" integer NOT NULL,
	"cgst_cents" integer NOT NULL,
	"sgst_cents" integer NOT NULL,
	"igst_cents" integer NOT NULL,
	"round_off_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"payment_label" text NOT NULL,
	"payment_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_invoices_basis_check" CHECK ("tax_invoices"."place_of_supply_basis" in ('gstin', 'billing_address', 'supplier_location')),
	CONSTRAINT "tax_invoices_tax_check" CHECK (case "tax_invoices"."supply_type"
        when 'intra_state' then "tax_invoices"."igst_cents" = 0 and "tax_invoices"."cgst_cents" = "tax_invoices"."sgst_cents"
        when 'inter_state' then "tax_invoices"."cgst_cents" = 0 and "tax_invoices"."sgst_cents" = 0
        else false end),
	CONSTRAINT "tax_invoices_total_check" CHECK ("tax_invoices"."taxable_cents" > 0 and "tax_invoices"."cgst_cents" >= 0 and "tax_invoices"."igst_cents" >= 0
        and "tax_invoices"."total_cents" = "tax_invoices"."taxable_cents" + "tax_invoices"."cgst_cents" + "tax_invoices"."sgst_cents" + "tax_invoices"."igst_cents" + "tax_invoices"."round_off_cents")
);
--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_invoices_payment_id_idx" ON "tax_invoices" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_invoices_number_idx" ON "tax_invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_invoices_series_serial_idx" ON "tax_invoices" USING btree ("prefix","financial_year","serial");--> statement-breakpoint
CREATE INDEX "tax_invoices_business_id_idx" ON "tax_invoices" USING btree ("business_id","issued_on");