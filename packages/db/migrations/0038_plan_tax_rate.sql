-- Plans can carry tax on top of their price, in basis points (1800 is 18%). Every existing plan defaults to 0, so
-- nothing already sold changes: the $75 and ₹3,500 plans keep charging exactly what they charge today.
ALTER TABLE "plans" ADD COLUMN "tax_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_tax_rate_check" CHECK ("plans"."tax_rate_basis_points" between 0 and 10000);