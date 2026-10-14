-- Permanent directory ids, expand step (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md, Task 6):
-- every table that names a directory business by its listing key gains a nullable place_id, its directory_places id
-- (0075). Nothing writes it yet; backfillDirectoryPlaces (pnpm directory:backfill-places) fills it from the listing
-- key, deduplicating first, because the partial unique indexes below already hold the key's one-per-business rules
-- for place ids. listing_key stays as it is until the platform reads and writes by id. drizzle-kit's DDL, unchanged.
-- No new grants: each table's own (0053, 0055, 0057, 0059, 0065, 0067) cover the new column.
ALTER TABLE "directory_listings" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_ad_bids" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_daily_counts" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_review_otps" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_verifications" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "directory_listings" ADD CONSTRAINT "directory_listings_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_bids" ADD CONSTRAINT "directory_ad_bids_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_ad_wins" ADD CONSTRAINT "directory_ad_wins_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_claims" ADD CONSTRAINT "directory_claims_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_staff_ads" ADD CONSTRAINT "directory_staff_ads_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_daily_counts" ADD CONSTRAINT "directory_daily_counts_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_enquiries" ADD CONSTRAINT "directory_enquiries_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_review_otps" ADD CONSTRAINT "directory_review_otps_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_reviews" ADD CONSTRAINT "directory_reviews_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_verifications" ADD CONSTRAINT "directory_verifications_place_id_directory_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."directory_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_listings_place_id_idx" ON "directory_listings" USING btree ("place_id") WHERE "directory_listings"."place_id" is not null;--> statement-breakpoint
CREATE INDEX "directory_ad_wins_place_id_idx" ON "directory_ad_wins" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "directory_claims_place_id_idx" ON "directory_claims" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_claims_place_id_approved_idx" ON "directory_claims" USING btree ("place_id") WHERE "directory_claims"."place_id" is not null and "directory_claims"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "directory_daily_counts_place_day_kind_idx" ON "directory_daily_counts" USING btree ("place_id","day","kind") WHERE "directory_daily_counts"."place_id" is not null;--> statement-breakpoint
CREATE INDEX "directory_enquiries_place_id_idx" ON "directory_enquiries" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "directory_reviews_place_id_idx" ON "directory_reviews" USING btree ("place_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_reviews_place_id_phone_idx" ON "directory_reviews" USING btree ("place_id","phone") WHERE "directory_reviews"."place_id" is not null and "directory_reviews"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "directory_verifications_place_id_idx" ON "directory_verifications" USING btree ("place_id") WHERE "directory_verifications"."place_id" is not null;