-- Grants for the last step of deleting an account (queries/account-erasure.ts), which runs on the staff connection
-- only. Erasing removes what a person gave us, so the staff role needs DELETE on the tables that hold it; every one
-- of these already has a staff_all policy for ALL commands, so row-level security needs no change. Nothing is granted
-- to bb_app or bb_public. Financial records (subscriptions, payments, charges, ad bids and wins) get no
-- DELETE: the books stay whole.
GRANT DELETE ON "appointments" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_services" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "appointment_settings" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "practitioners" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "business_members" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "business_modules" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_business_profiles" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_claims" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_deals" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "directory_pictures" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "leads" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "setup_invites" TO bb_staff;
--> statement-breakpoint
GRANT DELETE ON "email_messages" TO bb_staff;
