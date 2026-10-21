-- What a plan payment was billed as (the services and their package discounts), kept beside the payment so an invoice staff
-- issue later is the one the payment path would have issued, though the services, the offer or a code have changed since.
-- Null for payments invoiced from another record and for any recorded before this existed.
ALTER TABLE "payments" ADD COLUMN "invoice_basis" jsonb;