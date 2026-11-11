CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text,
	"name" text,
	"phone" text,
	"email" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"received_at" timestamp with time zone NOT NULL,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_kind_check" CHECK ("enquiries"."kind" in ('chat', 'form', 'call_tap', 'whatsapp_tap', 'google_call', 'ad_lead')),
	CONSTRAINT "enquiries_status_check" CHECK ("enquiries"."status" in ('new', 'contacted', 'won', 'lost')),
	CONSTRAINT "enquiries_source_check" CHECK ("enquiries"."source" is null or char_length("enquiries"."source") <= 120),
	CONSTRAINT "enquiries_name_check" CHECK ("enquiries"."name" is null or char_length("enquiries"."name") <= 200),
	CONSTRAINT "enquiries_phone_check" CHECK ("enquiries"."phone" is null or char_length("enquiries"."phone") <= 40),
	CONSTRAINT "enquiries_email_check" CHECK ("enquiries"."email" is null or char_length("enquiries"."email") <= 320),
	CONSTRAINT "enquiries_message_check" CHECK ("enquiries"."message" is null or char_length("enquiries"."message") <= 5000),
	CONSTRAINT "enquiries_note_check" CHECK ("enquiries"."note" is null or char_length("enquiries"."note") <= 1000),
	CONSTRAINT "enquiries_source_ref_check" CHECK (char_length("enquiries"."source_ref") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"business_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_pages_business_id_url_pk" PRIMARY KEY("business_id","url"),
	CONSTRAINT "website_pages_url_check" CHECK (char_length("website_pages"."url") <= 2000 and "website_pages"."url" ~ '^https?://'),
	CONSTRAINT "website_pages_title_check" CHECK ("website_pages"."title" is null or char_length("website_pages"."title") <= 300)
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text,
	"url" text,
	"status" text DEFAULT 'not_connected' NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connected_accounts_platform_check" CHECK ("connected_accounts"."platform" in ('facebook', 'instagram', 'google_business', 'youtube', 'linkedin', 'x', 'whatsapp_business')),
	CONSTRAINT "connected_accounts_status_check" CHECK ("connected_accounts"."status" in ('connected', 'needs_attention', 'not_connected')),
	CONSTRAINT "connected_accounts_handle_check" CHECK ("connected_accounts"."handle" is null or char_length(btrim("connected_accounts"."handle")) between 1 and 120),
	CONSTRAINT "connected_accounts_url_check" CHECK ("connected_accounts"."url" is null or (char_length("connected_accounts"."url") <= 500 and "connected_accounts"."url" ~ '^https://'))
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text NOT NULL,
	"business_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_business_id_topic_pk" PRIMARY KEY("user_id","business_id","topic"),
	CONSTRAINT "notification_preferences_topic_check" CHECK ("notification_preferences"."topic" in ('new_enquiry', 'needs_approval', 'request_reply', 'billing', 'monthly_report', 'product_news'))
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"user_id" text NOT NULL,
	"business_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_reads_user_id_business_id_pk" PRIMARY KEY("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "business_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "business_member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "business_invites_role_check" CHECK ("business_invites"."role" in ('editor', 'viewer')),
	CONSTRAINT "business_invites_email_check" CHECK (char_length("business_invites"."email") <= 320 and "business_invites"."email" = lower(btrim("business_invites"."email")) and "business_invites"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
	CONSTRAINT "business_invites_closed_check" CHECK ("business_invites"."accepted_at" is null or "business_invites"."revoked_at" is null),
	CONSTRAINT "business_invites_expiry_check" CHECK ("business_invites"."expires_at" > "business_invites"."created_at")
);
--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invites" ADD CONSTRAINT "business_invites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invites" ADD CONSTRAINT "business_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enquiries_business_kind_source_ref_idx" ON "enquiries" USING btree ("business_id","kind","source_ref");--> statement-breakpoint
CREATE INDEX "enquiries_business_received_idx" ON "enquiries" USING btree ("business_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_business_platform_idx" ON "connected_accounts" USING btree ("business_id","platform");--> statement-breakpoint
CREATE INDEX "connected_accounts_status_idx" ON "connected_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "business_invites_business_idx" ON "business_invites" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_invites_one_open_idx" ON "business_invites" USING btree ("business_id","email") WHERE "business_invites"."accepted_at" is null and "business_invites"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "add_on_subscriptions" ADD CONSTRAINT "add_on_subscriptions_end_reason_check" CHECK ("add_on_subscriptions"."end_reason" is null or char_length("add_on_subscriptions"."end_reason") <= 500);--> statement-breakpoint
ALTER TABLE "bundled_add_ons" ADD CONSTRAINT "bundled_add_ons_end_reason_check" CHECK ("bundled_add_ons"."end_reason" is null or char_length("bundled_add_ons"."end_reason") <= 500);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_cancel_reason_check" CHECK ("subscriptions"."cancel_reason" is null or char_length("subscriptions"."cancel_reason") <= 500);--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_format_check" CHECK ("deliverables"."format" is null or ("deliverables"."kind" = 'post' and "deliverables"."format" in ('post', 'reel', 'story', 'carousel', 'video')));--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_channel_check" CHECK ("deliverables"."channel" is null or ("deliverables"."kind" = 'post' and "deliverables"."channel" in ('facebook', 'instagram', 'google_business', 'youtube', 'linkedin', 'x')));