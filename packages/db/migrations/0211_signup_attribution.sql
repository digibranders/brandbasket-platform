CREATE TABLE "signup_attribution" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"gclid" text,
	"fbclid" text,
	"fbp" text,
	"fbc" text,
	"ga_client_id" text,
	"ga_session_id" text,
	"landing_path" text,
	"referrer_host" text,
	"consent_measurement" boolean NOT NULL,
	"consent_advertising" boolean NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_attribution_campaign_check" CHECK (("signup_attribution"."utm_source" is null or char_length("signup_attribution"."utm_source") <= 120) and ("signup_attribution"."utm_medium" is null or char_length("signup_attribution"."utm_medium") <= 120) and ("signup_attribution"."utm_campaign" is null or char_length("signup_attribution"."utm_campaign") <= 120) and ("signup_attribution"."utm_term" is null or char_length("signup_attribution"."utm_term") <= 120) and ("signup_attribution"."utm_content" is null or char_length("signup_attribution"."utm_content") <= 120) and ("signup_attribution"."gclid" is null or char_length("signup_attribution"."gclid") <= 120) and ("signup_attribution"."fbclid" is null or char_length("signup_attribution"."fbclid") <= 120)),
	CONSTRAINT "signup_attribution_browser_check" CHECK (("signup_attribution"."fbp" is null or char_length("signup_attribution"."fbp") <= 60) and ("signup_attribution"."fbc" is null or char_length("signup_attribution"."fbc") <= 120) and ("signup_attribution"."ga_client_id" is null or char_length("signup_attribution"."ga_client_id") <= 40) and ("signup_attribution"."ga_session_id" is null or char_length("signup_attribution"."ga_session_id") <= 20) and ("signup_attribution"."referrer_host" is null or char_length("signup_attribution"."referrer_host") <= 100)),
	CONSTRAINT "signup_attribution_path_check" CHECK ("signup_attribution"."landing_path" is null or (char_length("signup_attribution"."landing_path") between 1 and 200 and "signup_attribution"."landing_path" like '/%'))
);
--> statement-breakpoint
ALTER TABLE "signup_attribution" ADD CONSTRAINT "signup_attribution_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Written once by the sign-up (the staff connection), read by the payment report and the console; erased with the account.
-- Never updated, and a customer reads none of it, so there is no grant to the app role.
GRANT SELECT, INSERT, DELETE ON signup_attribution TO bb_staff;
--> statement-breakpoint
ALTER TABLE signup_attribution ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY signup_attribution_staff_all ON signup_attribution FOR ALL TO bb_staff USING (true) WITH CHECK (true);
