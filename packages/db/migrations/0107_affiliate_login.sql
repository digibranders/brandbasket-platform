ALTER TABLE "affiliates" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "login_token_hash" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "login_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_login_token_hash_unique" UNIQUE("login_token_hash");--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_login_token_check" CHECK (("affiliates"."login_token_hash" is null) = ("affiliates"."login_token_expires_at" is null));