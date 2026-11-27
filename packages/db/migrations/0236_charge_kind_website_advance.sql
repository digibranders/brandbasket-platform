-- The new label is added in a migration of its own: Postgres will not use a label added in the same transaction.
ALTER TYPE "public"."charge_kind" ADD VALUE 'website_advance';
