CREATE TABLE "channel_link_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"network" text NOT NULL,
	"url" text NOT NULL,
	"handle" text NOT NULL,
	"state" text DEFAULT 'requested' NOT NULL,
	"reason" text,
	"requested_by_user_id" text,
	"notified_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"answered_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_link_requests_network_check" CHECK ("channel_link_requests"."network" in ('instagram', 'facebook')),
	CONSTRAINT "channel_link_requests_state_check" CHECK ("channel_link_requests"."state" in ('requested', 'invited', 'refused', 'connected')),
	CONSTRAINT "channel_link_requests_url_check" CHECK (char_length("channel_link_requests"."url") between 8 and 300 and "channel_link_requests"."url" ~ '^https://'),
	CONSTRAINT "channel_link_requests_handle_check" CHECK (char_length(btrim("channel_link_requests"."handle")) between 1 and 120),
	CONSTRAINT "channel_link_requests_reason_check" CHECK ("channel_link_requests"."reason" is null or ("channel_link_requests"."state" = 'refused' and char_length(btrim("channel_link_requests"."reason")) between 3 and 400))
);
--> statement-breakpoint
ALTER TABLE "channel_link_requests" ADD CONSTRAINT "channel_link_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_requests" ADD CONSTRAINT "channel_link_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_requests" ADD CONSTRAINT "channel_link_requests_answered_by_staff_id_users_id_fk" FOREIGN KEY ("answered_by_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_link_requests_brand_network_idx" ON "channel_link_requests" USING btree ("business_id","brand_id","network");--> statement-breakpoint
-- A customer sends the link to her Instagram or Facebook profile, changes it while nobody has answered, and takes it back; she reads
-- her own business's requests. The team answers on the staff connection (invited, refused with a reason, connected). A request is
-- never deleted by anyone but the customer who made it (or staff).
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_link_requests TO bb_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_link_requests TO bb_staff;
--> statement-breakpoint
ALTER TABLE channel_link_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY channel_link_requests_tenant_select ON channel_link_requests FOR SELECT TO bb_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY channel_link_requests_tenant_insert ON channel_link_requests FOR INSERT TO bb_app
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY channel_link_requests_tenant_update ON channel_link_requests FOR UPDATE TO bb_app
  USING (business_id = app_current_business_id() AND state IN ('requested', 'refused'))
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY channel_link_requests_tenant_delete ON channel_link_requests FOR DELETE TO bb_app
  USING (business_id = app_current_business_id() AND state IN ('requested', 'refused'));
--> statement-breakpoint
CREATE POLICY channel_link_requests_staff_all ON channel_link_requests FOR ALL TO bb_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The rule book for every writer. The customer role may only ask (state requested, no answer on it) and may only change a request that
-- has not been answered; the answer (invited, refused, connected, the reason, who and when) is staff's. A request keeps its business, brand
-- and network.
CREATE OR REPLACE FUNCTION public.channel_link_requests_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'bb_app' AND (NEW.state <> 'requested' OR NEW.reason IS NOT NULL OR NEW.answered_at IS NOT NULL OR NEW.answered_by_staff_id IS NOT NULL) THEN
      RAISE EXCEPTION '% may only ask for a channel to be set up', current_user USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id, NEW.business_id, NEW.brand_id, NEW.network, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.business_id, OLD.brand_id, OLD.network, OLD.created_at) THEN
    RAISE EXCEPTION 'A request''s business, brand and network cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF current_user = 'bb_app' AND (NEW.state <> 'requested' OR NEW.reason IS NOT NULL OR NEW.answered_at IS NOT NULL OR NEW.answered_by_staff_id IS NOT NULL) THEN
    RAISE EXCEPTION '% may only send a new link, not answer a request', current_user USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER channel_link_requests_guard
  BEFORE INSERT OR UPDATE ON channel_link_requests
  FOR EACH ROW EXECUTE FUNCTION public.channel_link_requests_guard();
