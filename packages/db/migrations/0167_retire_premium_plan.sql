-- Fynix sells Care and its add-ons only. The Premium plan is taken off sale: its rows stay (a subscription points at its plan
-- row, and invoices and receipts read it), but none is active, so no Premium checkout can open and the platform's plan
-- lookup finds none. Nothing is deleted and the plan_tier enum keeps its value. Staff can put a Premium price on sale again
-- from the console's Pricing page.
UPDATE "plans" SET "active" = false, "updated_at" = now() WHERE "tier" = 'premium' AND "active";
