-- Grants for the last step of deleting an account (queries/account-erasure.ts), which runs on the staff connection
-- only. Erasing removes what a person gave us, so the staff role needs DELETE on the tables that hold it; every one
-- of these already has a staff_all policy for ALL commands, so row-level security needs no change. Nothing is granted
-- to fynix_app or fynix_public. Financial records (subscriptions, payments, charges, ad bids and wins) get no
-- DELETE: the books stay whole.
GRANT DELETE ON "appointments" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_services" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_settings" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "practitioners" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "business_members" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "business_modules" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_business_profiles" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_claims" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_deals" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_pictures" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "leads" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "setup_invites" TO fynix_staff;
--> statement-breakpoint
GRANT DELETE ON "email_messages" TO fynix_staff;
