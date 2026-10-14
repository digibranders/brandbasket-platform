-- Grants for the last step of deleting an account (queries/account-erasure.ts), which runs on the staff connection
-- only. Erasing removes what a person gave us, so the staff role needs DELETE on the tables that hold it; every one
-- of these already has a staff_all policy for ALL commands, so row-level security needs no change. Nothing is granted
-- to webfold_app or webfold_public. Financial records (subscriptions, payments, charges, ad bids and wins) get no
-- DELETE: the books stay whole.
GRANT DELETE ON "appointments" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_services" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_settings" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "practitioners" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "business_members" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "business_modules" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_business_profiles" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_claims" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_deals" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_pictures" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "leads" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "setup_invites" TO webfold_staff;
--> statement-breakpoint
GRANT DELETE ON "email_messages" TO webfold_staff;
