CREATE TYPE "public"."appointment_status" AS ENUM('booked', 'cancelled', 'done');--> statement-breakpoint
CREATE TYPE "public"."business_module" AS ENUM('appointments');--> statement-breakpoint
CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "appointment_services_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "appointment_services_name_check" CHECK (char_length("appointment_services"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "appointment_settings" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"accepting" boolean DEFAULT true NOT NULL,
	"paused_message" text,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"min_notice_minutes" integer DEFAULT 60 NOT NULL,
	"horizon_days" integer DEFAULT 28 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_settings_paused_message_check" CHECK ("appointment_settings"."paused_message" is null or char_length("appointment_settings"."paused_message") between 1 and 160),
	CONSTRAINT "appointment_settings_slot_minutes_check" CHECK ("appointment_settings"."slot_minutes" in (15, 20, 30, 45, 60)),
	CONSTRAINT "appointment_settings_min_notice_minutes_check" CHECK ("appointment_settings"."min_notice_minutes" between 0 and 10080),
	CONSTRAINT "appointment_settings_horizon_days_check" CHECK ("appointment_settings"."horizon_days" between 1 and 180)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" text,
	"patient_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"patient_note" text,
	"local_date" date NOT NULL,
	"local_start" time NOT NULL,
	"local_end" time NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'booked' NOT NULL,
	"cancel_reason" text,
	"clinic_note" text,
	"cancelled_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_by_user_id" text,
	"seen_at" timestamp with time zone,
	CONSTRAINT "appointments_patient_name_check" CHECK (char_length("appointments"."patient_name") between 1 and 80),
	CONSTRAINT "appointments_phone_check" CHECK ("appointments"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "appointments_email_check" CHECK ("appointments"."email" is null or char_length("appointments"."email") between 3 and 254),
	CONSTRAINT "appointments_service_name_check" CHECK ("appointments"."service_name" is null or char_length("appointments"."service_name") between 1 and 80),
	CONSTRAINT "appointments_patient_note_check" CHECK ("appointments"."patient_note" is null or char_length("appointments"."patient_note") between 1 and 300),
	CONSTRAINT "appointments_cancel_reason_check" CHECK ("appointments"."cancel_reason" is null or char_length("appointments"."cancel_reason") between 1 and 200),
	CONSTRAINT "appointments_clinic_note_check" CHECK ("appointments"."clinic_note" is null or char_length("appointments"."clinic_note") between 1 and 500),
	CONSTRAINT "appointments_ends_at_check" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_max_duration_check" CHECK ("appointments"."ends_at" <= "appointments"."starts_at" + interval '1 day')
);
--> statement-breakpoint
CREATE TABLE "booking_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_otps_phone_check" CHECK ("booking_otps"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "booking_otps_code_hash_check" CHECK (char_length("booking_otps"."code_hash") > 0),
	CONSTRAINT "booking_otps_attempts_check" CHECK ("booking_otps"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"to_phone" text NOT NULL,
	"body" text NOT NULL,
	"transport" text DEFAULT 'outbox' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_announcements" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_announcements_message_check" CHECK (char_length("business_announcements"."message") between 1 and 100),
	CONSTRAINT "business_announcements_message_single_line_check" CHECK ("business_announcements"."message" !~ '[\r\n]'),
	CONSTRAINT "business_announcements_dates_check" CHECK ("business_announcements"."ends_on" >= "business_announcements"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "business_closures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_closures_dates_check" CHECK ("business_closures"."ends_on" >= "business_closures"."starts_on"),
	CONSTRAINT "business_closures_note_check" CHECK ("business_closures"."note" is null or char_length("business_closures"."note") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "business_modules" (
	"business_id" uuid NOT NULL,
	"module" "business_module" NOT NULL,
	"enabled" boolean NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_user_id" text NOT NULL,
	CONSTRAINT "business_modules_business_id_module_pk" PRIMARY KEY("business_id","module")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_settings" ADD CONSTRAINT "appointment_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_business_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."appointment_services"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_otps" ADD CONSTRAINT "booking_otps_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_announcements" ADD CONSTRAINT "business_announcements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_closures" ADD CONSTRAINT "business_closures_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_modules" ADD CONSTRAINT "business_modules_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_modules" ADD CONSTRAINT "business_modules_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_services_business_id_position_idx" ON "appointment_services" USING btree ("business_id","position");--> statement-breakpoint
CREATE INDEX "appointments_business_id_local_date_idx" ON "appointments" USING btree ("business_id","local_date");--> statement-breakpoint
CREATE INDEX "appointments_business_id_created_at_idx" ON "appointments" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_business_id_starts_at_idx" ON "appointments" USING btree ("business_id","starts_at") WHERE "appointments"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "booking_otps_business_id_phone_created_at_idx" ON "booking_otps" USING btree ("business_id","phone","created_at");--> statement-breakpoint
CREATE INDEX "sms_messages_created_at_idx" ON "sms_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "business_closures_business_id_ends_on_idx" ON "business_closures" USING btree ("business_id","ends_on");