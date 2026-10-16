ALTER TABLE "chatbot_webhook_secrets" ADD COLUMN "operator_key" text;--> statement-breakpoint
ALTER TABLE "chatbot_webhook_secrets" ADD CONSTRAINT "chatbot_webhook_secrets_operator_key_check" CHECK ("chatbot_webhook_secrets"."operator_key" is null or length("chatbot_webhook_secrets"."operator_key") between 16 and 200);
