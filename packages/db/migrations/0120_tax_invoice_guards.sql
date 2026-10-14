-- Guards for tax invoices (0119). An invoice is a legal record that nobody edits, so the database refuses one whose number
-- does not match its series, whose financial year does not match its date, whose tax type does not match its place of
-- supply, or whose figures do not add up. The checks repeat what the issuing code does on purpose. Also bounds the
-- billing address text. The total check is replaced to add a positive total and the round-off limit.

ALTER TABLE "tax_invoices" DROP CONSTRAINT "tax_invoices_total_check";--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_address_line1_check" CHECK (length(btrim("billing_profiles"."address_line1")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_city_check" CHECK (length(btrim("billing_profiles"."city")) between 1 and 100);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_json_shape_check" CHECK (case when jsonb_typeof("tax_invoices"."lines") = 'array' then jsonb_array_length("tax_invoices"."lines") between 1 and 8 else false end
        and jsonb_typeof("tax_invoices"."supplier") = 'object' and jsonb_typeof("tax_invoices"."recipient") = 'object');--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_number_check" CHECK ("tax_invoices"."serial" between 1 and 999999 and "tax_invoices"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$' and "tax_invoices"."prefix" ~ '^[A-Z0-9]+$'
        and "tax_invoices"."number" = "tax_invoices"."prefix" || '/' || "tax_invoices"."financial_year" || '/' || lpad("tax_invoices"."serial"::text, 6, '0'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_financial_year_check" CHECK ("tax_invoices"."financial_year" = lpad((((extract(year from "tax_invoices"."issued_on") - (case when extract(month from "tax_invoices"."issued_on") < 4 then 1 else 0 end)) % 100)::int)::text, 2, '0')
        || '-' || lpad((((extract(year from "tax_invoices"."issued_on") - (case when extract(month from "tax_invoices"."issued_on") < 4 then 1 else 0 end) + 1) % 100)::int)::text, 2, '0'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_place_of_supply_check" CHECK ("tax_invoices"."place_of_supply_state_code" ~ '^[a-z]{2}$'
        and coalesce("tax_invoices"."supplier"->>'stateCode' ~ '^[a-z]{2}$', false)
        and ("tax_invoices"."supply_type" = 'intra_state') = ("tax_invoices"."place_of_supply_state_code" = "tax_invoices"."supplier"->>'stateCode')
        and ("tax_invoices"."place_of_supply_basis" <> 'gstin' or "tax_invoices"."recipient"->>'gstin' is not null)
        and ("tax_invoices"."place_of_supply_basis" <> 'supplier_location' or "tax_invoices"."place_of_supply_state_code" = "tax_invoices"."supplier"->>'stateCode')
        and ("tax_invoices"."recipient"->>'gstin' is null or "tax_invoices"."recipient"->>'gstin' ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_payment_check" CHECK (length(btrim("tax_invoices"."payment_label")) > 0 and length(btrim("tax_invoices"."payment_reference")) > 0);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_total_check" CHECK ("tax_invoices"."taxable_cents" > 0 and "tax_invoices"."cgst_cents" >= 0 and "tax_invoices"."igst_cents" >= 0 and "tax_invoices"."total_cents" > 0
        and "tax_invoices"."total_cents" = "tax_invoices"."taxable_cents" + "tax_invoices"."cgst_cents" + "tax_invoices"."sgst_cents" + "tax_invoices"."igst_cents" + "tax_invoices"."round_off_cents"
        and case when jsonb_typeof("tax_invoices"."lines") = 'array' then abs("tax_invoices"."round_off_cents") <= jsonb_array_length("tax_invoices"."lines") else false end);