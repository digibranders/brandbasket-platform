CREATE TABLE "staff_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "staff_invites_role_check" CHECK ("staff_invites"."role" in ('support', 'finance', 'admin')),
	CONSTRAINT "staff_invites_email_check" CHECK ("staff_invites"."email" = lower(btrim("staff_invites"."email")) and char_length("staff_invites"."email") between 3 and 254),
	CONSTRAINT "staff_invites_used_once_check" CHECK (not ("staff_invites"."accepted_at" is not null and "staff_invites"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_staff_members_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."staff_members"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_invites_email_idx" ON "staff_invites" USING btree ("email");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_invites TO bb_staff;
--> statement-breakpoint
ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY staff_invites_staff_all ON staff_invites FOR ALL TO bb_staff USING (true) WITH CHECK (true);
