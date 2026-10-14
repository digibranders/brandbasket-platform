-- Further guards for tax invoices (0119, 0120). The recipient snapshot must carry a lower-case state code or none, and no
-- email or phone, and the place of supply must agree with how it was decided: a billing-address basis needs the
-- address's own state and no GSTIN, a supplier-location basis needs neither. The number is also held to the 16
-- characters GST allows. The number check is replaced to add that limit. The table is empty everywhere, so no row can
-- fail the new checks.

ALTER TABLE "tax_invoices" DROP CONSTRAINT "tax_invoices_number_check";--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_recipient_check" CHECK (("tax_invoices"."recipient"->>'stateCode' is null or "tax_invoices"."recipient"->>'stateCode' ~ '^[a-z]{2}$')
        and "tax_invoices"."recipient"->>'email' is null and "tax_invoices"."recipient"->>'phone' is null
        and ("tax_invoices"."place_of_supply_basis" <> 'billing_address'
          or (coalesce("tax_invoices"."place_of_supply_state_code" = "tax_invoices"."recipient"->>'stateCode', false) and "tax_invoices"."recipient"->>'gstin' is null))
        and ("tax_invoices"."place_of_supply_basis" <> 'supplier_location'
          or ("tax_invoices"."recipient"->>'gstin' is null and "tax_invoices"."recipient"->>'stateCode' is null)));--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_number_check" CHECK ("tax_invoices"."serial" between 1 and 999999 and "tax_invoices"."financial_year" ~ '^[0-9]{2}-[0-9]{2}$' and "tax_invoices"."prefix" ~ '^[A-Z0-9]+$'
        and length("tax_invoices"."number") <= 16
        and "tax_invoices"."number" = "tax_invoices"."prefix" || '/' || "tax_invoices"."financial_year" || '/' || lpad("tax_invoices"."serial"::text, 6, '0'));