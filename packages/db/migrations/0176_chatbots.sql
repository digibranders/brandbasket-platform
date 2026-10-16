CREATE TYPE "public"."chatbot_status" AS ENUM('setting_up', 'live', 'paused');--> statement-breakpoint
CREATE TABLE "chatbot_leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chatbot_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"company" text,
	"tier" text,
	"score" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_leads_session_check" CHECK (length("chatbot_leads"."session_id") between 1 and 200),
	CONSTRAINT "chatbot_leads_score_check" CHECK ("chatbot_leads"."score" is null or "chatbot_leads"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "chatbot_webhook_secrets" (
	"chatbot_id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_webhook_secrets_secret_check" CHECK (length("chatbot_webhook_secrets"."secret") between 16 and 200)
);
--> statement-breakpoint
CREATE TABLE "chatbots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"oyechats_bot_id" integer NOT NULL,
	"website_url" text,
	"status" "chatbot_status" DEFAULT 'setting_up' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chatbots_name_check" CHECK (length(btrim("chatbots"."name")) between 1 and 80),
	CONSTRAINT "chatbots_oyechats_bot_id_check" CHECK ("chatbots"."oyechats_bot_id" > 0),
	CONSTRAINT "chatbots_website_url_check" CHECK ("chatbots"."website_url" is null or "chatbots"."website_url" ~ '^https?://[^[:space:]]{1,255}$')
);
--> statement-breakpoint
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_webhook_secrets" ADD CONSTRAINT "chatbot_webhook_secrets_chatbot_id_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."chatbots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatbot_leads_session_idx" ON "chatbot_leads" USING btree ("chatbot_id","session_id");--> statement-breakpoint
CREATE INDEX "chatbot_leads_business_idx" ON "chatbot_leads" USING btree ("business_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chatbots_oyechats_bot_id_idx" ON "chatbots" USING btree ("oyechats_bot_id");--> statement-breakpoint
CREATE INDEX "chatbots_business_idx" ON "chatbots" USING btree ("business_id","created_at");