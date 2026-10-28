CREATE TABLE "site_hits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"referrer_host" text,
	"channel" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"device" text NOT NULL,
	"country" text,
	"label" text,
	"visitor_hash" text NOT NULL,
	"engaged_ms" integer,
	"scroll_pct" integer,
	CONSTRAINT "site_hits_kind_check" CHECK ("site_hits"."kind" in ('pageview', 'engagement', 'call', 'whatsapp', 'email', 'directions', 'social', 'outbound', 'download', 'form', 'custom')),
	CONSTRAINT "site_hits_channel_check" CHECK ("site_hits"."channel" in ('direct', 'search', 'social', 'email', 'ai', 'paid', 'referral')),
	CONSTRAINT "site_hits_device_check" CHECK ("site_hits"."device" in ('mobile', 'tablet', 'desktop')),
	CONSTRAINT "site_hits_path_check" CHECK (char_length("site_hits"."path") between 1 and 200 and "site_hits"."path" like '/%'),
	CONSTRAINT "site_hits_referrer_check" CHECK ("site_hits"."referrer_host" is null or char_length("site_hits"."referrer_host") <= 100),
	CONSTRAINT "site_hits_utm_check" CHECK (coalesce(char_length("site_hits"."utm_source"), 0) <= 60 and coalesce(char_length("site_hits"."utm_medium"), 0) <= 60 and coalesce(char_length("site_hits"."utm_campaign"), 0) <= 60),
	CONSTRAINT "site_hits_country_check" CHECK ("site_hits"."country" is null or "site_hits"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "site_hits_label_check" CHECK ("site_hits"."label" is null or char_length("site_hits"."label") <= 100),
	CONSTRAINT "site_hits_visitor_check" CHECK ("site_hits"."visitor_hash" ~ '^[0-9a-f]{32}$'),
	CONSTRAINT "site_hits_engaged_check" CHECK ("site_hits"."engaged_ms" is null or "site_hits"."engaged_ms" between 0 and 1800000),
	CONSTRAINT "site_hits_scroll_check" CHECK ("site_hits"."scroll_pct" is null or "site_hits"."scroll_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "site_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_keys_key_check" CHECK ("site_keys"."key" ~ '^bbk_[A-Za-z0-9]{16,40}$')
);
--> statement-breakpoint
CREATE TABLE "visitor_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_salts_salt_check" CHECK (char_length("visitor_salts"."salt") >= 32)
);
--> statement-breakpoint
ALTER TABLE "site_hits" ADD CONSTRAINT "site_hits_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_keys" ADD CONSTRAINT "site_keys_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_hits_business_at_idx" ON "site_hits" USING btree ("business_id","at");--> statement-breakpoint
CREATE INDEX "site_hits_at_idx" ON "site_hits" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_keys_business_idx" ON "site_keys" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_keys_key_idx" ON "site_keys" USING btree ("key");
--> statement-breakpoint
-- The ingest route inserts hits on the staff connection once the public key has proved the business (the same rule as
-- site_events). Hits are never updated, so no UPDATE is granted; a retention job deletes the old ones. A customer reads
-- their own key (the install step shows it) and nothing else here: the hits and the salts are private.
GRANT SELECT ON site_keys TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON site_keys, site_hits, visitor_salts TO bb_staff;
--> statement-breakpoint
-- A key can be replaced (rotated); its business never changes.
GRANT UPDATE (key) ON site_keys TO bb_staff;
--> statement-breakpoint
ALTER TABLE site_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_hits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE visitor_salts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY site_keys_tenant_select ON site_keys FOR SELECT TO bb_app USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY site_keys_staff_all ON site_keys FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY site_hits_staff_all ON site_hits FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY visitor_salts_staff_all ON visitor_salts FOR ALL TO bb_staff USING (true) WITH CHECK (true);
