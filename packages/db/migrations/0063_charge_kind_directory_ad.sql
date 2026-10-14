-- A charge kind for a won week of a Firstfold Local ad spot (directory_ad_wins). On its own because Postgres refuses to
-- use an enum value in the transaction that added it (55P04): 0064 uses it in charges' CHECKs. drizzle-kit's DDL,
-- unchanged.
ALTER TYPE "public"."charge_kind" ADD VALUE 'directory_ad';