-- Clinic patients (docs/superpowers/specs/2026-09-29-clinic-patients-design.md). The table and column DDL below is
-- drizzle-kit's; everything after the index on appointments (patient_id) is hand-written: the trigger that links
-- every new booking to a patient, the backfill that links every existing one, and only then the CHECK that a
-- booking has a patient exactly when it has a phone -- drizzle-kit put that CHECK straight after the new columns,
-- where every existing row would fail it. The end state is exactly the one meta/0050_snapshot.json describes.
--
-- 'no_show' is added to appointment_status here but used nowhere else in this migration: the migrator commits each
-- migration on its own (see src/migrator.ts) and Postgres refuses a new enum value inside the transaction that
-- added it (55P04), so everything that names it -- the guard trigger in 0051 -- lives in the next migration.
CREATE TYPE "public"."appointment_source" AS ENUM('online', 'clinic');--> statement-breakpoint
ALTER TYPE "public"."appointment_status" ADD VALUE 'no_show';--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"alt_phone" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "patients_business_id_phone_key" UNIQUE("business_id","phone"),
	CONSTRAINT "patients_name_check" CHECK (char_length("patients"."name") between 1 and 80),
	CONSTRAINT "patients_phone_check" CHECK ("patients"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "patients_alt_phone_check" CHECK ("patients"."alt_phone" is null or ("patients"."alt_phone" ~ '^\+[0-9]{8,15}$' and "patients"."alt_phone" <> "patients"."phone")),
	CONSTRAINT "patients_tags_check" CHECK (cardinality("patients"."tags") <= 5)
);
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "patient_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "source" "appointment_source" DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patients_business_id_alt_phone_idx" ON "patients" USING btree ("business_id","alt_phone") WHERE "patients"."alt_phone" is not null;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_business_fk" FOREIGN KEY ("business_id","patient_id") REFERENCES "public"."patients"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_business_id_patient_id_idx" ON "appointments" USING btree ("business_id","patient_id");
--> statement-breakpoint
-- Links every new booking to the business's patient with that phone number, creating the patient on a first
-- booking, so every insert path (the site's OTP confirm, reception's Add booking, tests, scripts) is covered by one
-- rule instead of each caller remembering to do it. A row that arrives with patient_id already set (bookSlot, when
-- reception books an existing patient again) or with no phone is left alone; the CHECK added at the end holds the
-- two together.
--
-- The lookup matches phone or alt_phone, preferring the patient whose main number it is. When none matches, the
-- insert is `ON CONFLICT (business_id, phone) DO NOTHING` followed by a re-select rather than a plain insert: two
-- first bookings from one number committing at the same time (bookSlot serialises its own calls per business, but
-- a script or a future path may not) would otherwise have the loser fail on patients_business_id_phone_key. With DO
-- NOTHING the loser waits for the winner's transaction, inserts nothing, and the re-select -- a new statement, so
-- a new snapshot under READ COMMITTED -- finds the winner's patient. A known patient's name is never overwritten
-- here: the booking keeps what was typed as its own patient_name snapshot, and the register keeps the clinic's.
--
-- NOT SECURITY DEFINER, for the reason 0042 gives for app_module_enabled: it runs as the inserting role, which is
-- bb_staff for every booking (bb_app has no INSERT on appointments), and 0051 grants that role what this
-- needs on patients. search_path is pinned so an unqualified name inside cannot be shadowed from pg_temp;
-- gen_random_uuid() (v4, like 0044's backfill) because the database has no uuidv7 function and nothing orders
-- patients by id.
CREATE FUNCTION appointments_link_patient() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  linked uuid;
BEGIN
  IF NEW.patient_id IS NOT NULL OR NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO linked
  FROM public.patients p
  WHERE p.business_id = NEW.business_id AND (p.phone = NEW.phone OR p.alt_phone = NEW.phone)
  ORDER BY (p.phone = NEW.phone) DESC, p.created_at, p.id
  LIMIT 1;

  IF linked IS NULL THEN
    INSERT INTO public.patients (id, business_id, name, phone)
    VALUES (gen_random_uuid(), NEW.business_id, NEW.patient_name, NEW.phone)
    ON CONFLICT (business_id, phone) DO NOTHING
    RETURNING id INTO linked;
  END IF;

  IF linked IS NULL THEN
    SELECT p.id INTO linked
    FROM public.patients p
    WHERE p.business_id = NEW.business_id AND p.phone = NEW.phone;
  END IF;

  NEW.patient_id := linked;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION appointments_link_patient() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER appointments_link_patient
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_link_patient();
--> statement-breakpoint
-- Backfill: one patient per (business, phone) among existing bookings, named from the most recently made booking
-- (the latest thing the patient typed) and first seen at the earliest, so "New this month" means new to the clinic
-- rather than new to this table. Then every existing booking is pointed at its patient.
INSERT INTO "patients" ("id", "business_id", "name", "phone", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  a."business_id",
  (array_agg(a."patient_name" ORDER BY a."created_at" DESC, a."id" DESC))[1],
  a."phone",
  min(a."created_at"),
  now()
FROM "appointments" a
WHERE a."phone" IS NOT NULL
GROUP BY a."business_id", a."phone";
--> statement-breakpoint
UPDATE "appointments" a SET "patient_id" = p."id"
FROM "patients" p
WHERE p."business_id" = a."business_id" AND p."phone" = a."phone" AND a."patient_id" IS NULL;
--> statement-breakpoint
-- Every existing row now has both a phone and a patient, so this validates at once; a row that somehow did not
-- would fail the whole migration loudly rather than be left unlinked.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_link_check" CHECK (("appointments"."patient_id" is null) = ("appointments"."phone" is null));
