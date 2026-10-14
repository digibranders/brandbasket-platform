-- plans.active was free text holding 'yes'. It becomes a real boolean so no other spelling can mean "live".
-- Existing rows convert explicitly: 'yes' is true and 'no' is false. Any other value has no CASE branch, becomes
-- NULL and fails the NOT NULL constraint, so an unexpected spelling stops the migration instead of being guessed.
-- The partial unique index names the column, so it is dropped first and rebuilt on the boolean.
DROP INDEX "plans_currency_active_idx";--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "active" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "active" SET DATA TYPE boolean USING (
  CASE "active" WHEN 'yes' THEN true WHEN 'no' THEN false END
);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_currency_active_idx" ON "plans" USING btree ("currency") WHERE "plans"."active";
