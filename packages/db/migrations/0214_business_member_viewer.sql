-- The new label is added in a migration of its own: Postgres will not use a label added in the same transaction, and
-- 0216's invites check and role policies refer to it.
ALTER TYPE "public"."business_member_role" ADD VALUE 'viewer';