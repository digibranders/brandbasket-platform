-- Confirming the first payment is one transaction that does two kinds of work: it records the payment and opens the
-- subscription (billing rows, which only fynix_staff may write) and it submits the customer's project (the
-- onboarding -> submitted transition, which projects_guard_customer_transition reserves for fynix_app, bound by
-- row-level security to the customer's own business). Two connections cannot share a transaction, so the staff
-- connection switches to fynix_app with SET LOCAL ROLE for the submission (see withCustomerRole in
-- packages/db/src/scope.ts). SET ROLE requires membership in the target role.
--
-- NOINHERIT first, so that membership lends fynix_staff nothing by default: it keeps exactly its own grants and
-- policies, and fynix_app's policies and privileges apply only after an explicit SET ROLE, which also makes
-- current_user 'fynix_app' so the transition trigger and RLS treat the submission exactly as a customer's.
-- Nothing is widened in the other direction: fynix_app gains no membership and still cannot write billing rows.
-- Roles are cluster-wide, so on a server holding both the dev and test databases the second run of these two
-- statements changes nothing (Postgres 14 reports the existing membership as a notice, not an error).
ALTER ROLE fynix_staff NOINHERIT;
--> statement-breakpoint

GRANT fynix_app TO fynix_staff;
