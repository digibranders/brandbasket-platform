-- A charge kind for a week of a paid tag on a client's the local directory listing. On its own because Postgres refuses to
-- use an enum value in the transaction that added it (55P04): 0061 uses it in charges' new index and CHECKs, and the
-- migrator commits each migration separately (src/migrator.ts). drizzle-kit's DDL, unchanged.
ALTER TYPE "public"."charge_kind" ADD VALUE 'listing_promotion';
