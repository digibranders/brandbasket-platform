> Superseded by docs/superpowers/plans/2026-09-25-slot-booking.md for booking; admin switch, hours/closures/announcement and site info remain as described.

# Business modules: appointments, opening hours and announcements — Implementation Plan

> **Update, 2026-09-25 (user decision): no emails.** Appointments send no email to the clinic or the patient, and
> there is no notification-email setting. The dashboard's "Appointments · N" count (refreshed on focus and every
> 60 seconds) is how a clinic notices new requests. The patient's optional email is kept as contact information only.
> Every email mention below is superseded by this note.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phases 1–3 of `docs/superpowers/specs/2026-09-25-business-modules-appointments-design.md`: a
superadmin module switch, client-editable hours, closures and announcement, a site info API, appointment intake,
an appointments inbox, and the client-site kit. Everything is proven locally end to end.

**Architecture:** The platform owns the data in the Drizzle database behind RLS. The static client site reads
`GET /api/site/info` and forwards its booking form server-to-server to `POST /api/site/appointments`, authenticated
by the existing per-business site token (a Payload tenant field). Pure rules (dates, statuses, form parsing) live in
`packages/shared`, queries in `packages/db`, and pages and actions in `apps/platform` (customer) and `apps/admin`
(staff).

**Tech stack:** Next.js 16 app router, TypeScript strict, Drizzle 0.45 + Postgres 14 with RLS, zod 4, Vitest 5,
Payload 3 (tokens only), pnpm workspace.

---

## Ground rules for every task

- **Work only in the worktree** `/Users/siddiqueahmed/Desktop/AI/fynix-platform/appointments-spec` (branch
  `docs/appointments-module-spec`). The client-site kit is the exception: it goes in the
  `fynix-test-client-site` worktree created in Task 9.
- **Never commit or push.** The user commits. Leave changes in the working tree. Where a step would normally commit,
  run the task's checks instead.
- **Databases are this branch's own copies:** dev `fynix_appt`, tests `fynix_appt_test`, Payload
  `fynix_platform_payload_appt`. The `.env.local` files in `apps/platform` and `apps/admin` already point at them. Never
  touch `fynix_platform`, `fynix_platform_test` or `fynix_platform_payload`.
- **Match the surrounding code:** file header comments that explain *why*, `readonly` props, explicit return
  types, no `any`, specific error classes. Read the neighbouring file before writing a new one.
- **Dashboard UI rule (user, 2026-09-24):** no boxed card grids and no helper paragraphs on the main screens.
  Separate with whitespace and hairlines, use short labels and big numbers. The admin console follows its existing
  look (`Section` blocks on the client page).
- **Checks per task:** the package's `vitest` for what you touched, `pnpm typecheck`, and for the apps
  `pnpm --filter <app> lint`. DB tasks also run `pnpm test:integration`.

## File map

| Unit | Files |
|---|---|
| Shared rules | `packages/shared/src/lib/business-modules.ts`, `packages/shared/src/lib/calendar/local-date.ts`, `packages/shared/src/lib/business-facts/{announcement,closures,forms}.ts`, `packages/shared/src/lib/appointments/{status,booking-date,request-form,settings-form}.ts` (+ `.test.ts` each) |
| Schema | `packages/db/src/schema/modules.ts`, `packages/db/src/schema/business-facts.ts`, `packages/db/src/schema/appointments.ts`, `businesses.ts` (+`timeZone`), `schema/index.ts` |
| Migrations | `packages/db/migrations/0041_business_modules_appointments.sql` (generated), `0042_business_modules_appointments_grants.sql` (custom) |
| Queries | `packages/db/src/queries/business-modules.ts`, `business-facts.ts`, `appointments.ts` (+ `.integration.test.ts` each in `packages/db/src/`) |
| Email | `packages/email/src/templates/appointment-{requested,confirmed,suggested,declined}.ts`, `src/index.ts`, `templates.test.ts` |
| Site API | `apps/platform/lib/site-info.ts`, `apps/platform/lib/site-appointments.ts`, `apps/platform/lib/server/site-info.ts`, `apps/platform/lib/server/appointment-intake.ts` (+test), `apps/platform/lib/server/appointments.ts`, `apps/platform/app/api/site/info/route.ts`, `apps/platform/app/api/site/appointments/route.ts`, `apps/platform/lib/server/site-cors.ts` |
| Admin | `apps/admin/components/client-features.tsx`, `apps/admin/app/(protected)/clients/[businessId]/{page,actions}.ts(x)`, the lead detail page |
| Customer | `apps/platform/app/app-host/(protected)/details/*`, `apps/platform/app/app-host/(protected)/appointments/*`, `apps/platform/components/panel/customer-shell.tsx`, `apps/platform/lib/server/business-modules.ts` |
| Client-site kit | `fynix-test-client-site` worktree: `lib/site-info.ts`, `lib/fynix-info.ts`, `lib/site-appointments.ts`, `components/{announcement-bar,opening-hours,booking-form}.tsx`, `app/api/book/route.ts`, `app/book/page.tsx` |

---

### Task 1: Shared rules (pure, no I/O)

**Files:** create everything under "Shared rules" in the file map, and add exports to `packages/shared/package.json`
if that package uses an explicit `exports` map (check first; follow how `lib/business-types.ts` is imported as
`@fynix/shared/lib/business-types`).

- [ ] **Step 1: `business-modules.ts`**

```ts
import type { BusinessType } from "./business-types";

/** The optional features a business can have switched on. Stored as the `business_module` enum's values. */
export const BUSINESS_MODULES = ["appointments"] as const;
export type BusinessModule = (typeof BUSINESS_MODULES)[number];

export const BUSINESS_MODULE_LABELS: Readonly<Record<BusinessModule, string>> = { appointments: "Appointments" };

export function isBusinessModule(value: string): value is BusinessModule {
  return (BUSINESS_MODULES as readonly string[]).includes(value);
}

/** Trades that usually take bookings. Only a hint for staff on the lead page: nothing is switched on from it. */
const SUGGESTIONS: Partial<Readonly<Record<BusinessType, readonly BusinessModule[]>>> = {
  clinic: ["appointments"],
  salon: ["appointments"],
  fitness: ["appointments"],
};

export function suggestedModules(businessType: string | null): readonly BusinessModule[] {
  if (businessType === null) return [];
  return SUGGESTIONS[businessType as BusinessType] ?? [];
}
```

Tests: `clinic`→`["appointments"]`, `restaurant`→`[]`, `null`→`[]`, unknown slug→`[]`.

- [ ] **Step 2: `calendar/local-date.ts`**: calendar dates as `YYYY-MM-DD` strings, never `Date`s, so no time zone
  conversion can move a day.

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date such as 2026-02-28 (and false for 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(value: string): boolean {
  if (value === "UTC") return true;
  return Intl.supportedValuesOf("timeZone").includes(value);
}

/** Today's date where the business is, e.g. localDateIn("Asia/Kolkata", now). */
export function localDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Monday = 0, matching business_hours.day_of_week. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}
```

Tests: `isIsoDate("2026-02-30")` false; `localDateIn("Asia/Kolkata", new Date("2026-09-25T20:00:00Z"))` is
`"2026-09-26"`; `localDateIn("America/New_York", same)` is `"2026-09-25"`; `addDays("2026-12-31", 1)` is
`"2027-01-01"`; `weekdayIndex("2026-09-28")` (a Monday) is 0; `isValidTimeZone("Mars/Base")` false.

- [ ] **Step 3: `business-facts/announcement.ts` and `closures.ts`**

```ts
export const ANNOUNCEMENT_MAX_LENGTH = 100;
export interface Announcement { readonly message: string; readonly startsOn: string; readonly endsOn: string }
/** The announcement if it shows today (start and end days inclusive), else null. */
export function activeAnnouncement(announcement: Announcement | null, today: string): Announcement | null;
```

```ts
export const CLOSURE_NOTE_MAX_LENGTH = 80;
export interface Closure { readonly id: string; readonly startsOn: string; readonly endsOn: string; readonly note: string | null }
/** Closures that have not ended by `today`, soonest first. */
export function upcomingClosures<T extends Closure>(closures: readonly T[], today: string): T[];
/** The closure covering `date`, if any. */
export function closureOn<T extends Closure>(closures: readonly T[], date: string): T | null;
```

Tests cover inclusive edges (starts today, ends today, ended yesterday, starts tomorrow).

- [ ] **Step 4: `business-facts/forms.ts`**: form parsers returning
  `{ success: true; data } | { success: false; field: string | null; message: string }`.
  - `parseAnnouncementForm(formData)`: fields `message` (trimmed, 1–100, no newlines), `startsOn`, `endsOn` (ISO
    dates, end ≥ start). Messages: "Write the announcement in one line, up to 100 characters.", "Choose the day it
    starts.", "The last day can't be before the first."
  - `parseClosureForm(formData)`: `startsOn`, `endsOn` (end ≥ start), `note` (optional, ≤80, trimmed, empty → null).

- [ ] **Step 5: `appointments/status.ts`**

```ts
export const APPOINTMENT_STATUSES = ["new", "confirmed", "suggested", "declined", "done", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_WINDOWS = ["morning", "afternoon", "evening", "any"] as const;
export type AppointmentWindow = (typeof APPOINTMENT_WINDOWS)[number];
export const APPOINTMENT_WINDOW_LABELS: Readonly<Record<AppointmentWindow, string>> =
  { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Any time" };
export const APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  new: "New", confirmed: "Confirmed", suggested: "Time suggested", declined: "Declined", done: "Done", cancelled: "Cancelled",
};
export type AppointmentAction = "confirm" | "suggest" | "decline" | "done";
/** Which statuses each action may start from. The conditional UPDATE in packages/db uses exactly this table. */
export const ACTION_ALLOWED_FROM: Readonly<Record<AppointmentAction, readonly AppointmentStatus[]>> = {
  confirm: ["new", "suggested"],
  suggest: ["new"],
  decline: ["new", "suggested", "confirmed"],
  done: ["confirmed"],
};
/** Declining after a confirmation is a cancellation, so the patient history reads truthfully. */
export function statusAfter(action: AppointmentAction, from: AppointmentStatus): AppointmentStatus | null;
/** New / Upcoming / Past grouping for the inbox. */
export type AppointmentGroup = "new" | "upcoming" | "past";
export const GROUP_STATUSES: Readonly<Record<AppointmentGroup, readonly AppointmentStatus[]>> = {
  new: ["new"], upcoming: ["confirmed", "suggested"], past: ["declined", "done", "cancelled"],
};
```

Tests: every (action, from) pair against the table. `statusAfter("decline","confirmed")` is `"cancelled"`,
`statusAfter("decline","new")` is `"declined"`, and `statusAfter("done","new")` is null.

- [ ] **Step 6: `appointments/booking-date.ts`**

```ts
import type { StoredHoursRow } from "../onboarding/hours";
export const BOOKING_HORIZON_DAYS = 90;
export interface BookingCalendar {
  readonly today: string;
  readonly hours: readonly Pick<StoredHoursRow, "dayOfWeek" | "closed">[];
  readonly closures: readonly Closure[];
}
/** Null when a patient may ask for `date`, otherwise the message to show them. */
export function bookingDateProblem(date: string, calendar: BookingCalendar): string | null;
```

Rules, in order:
1. not an ISO date → "Choose a date."
2. before today → "Choose today or a later date."
3. after today + 90 → "Choose a date within the next 90 days."
4. inside a closure → "We're closed on that day. Please choose another."
5. the weekday has hours rows and every one is `closed` → the same closed message
6. no rows for that weekday means hours unknown, so the date is allowed

- [ ] **Step 7: `appointments/request-form.ts`**: the patient's fields as the site forwards them.

```ts
export const appointmentRequestFieldsSchema = z.object({
  name: z.string(), phone: z.string(), email: z.string().optional(), serviceId: z.string().optional(),
  preferredDate: z.string(), preferredWindow: z.string(), note: z.string().optional(), website: z.string().optional(),
});
export type AppointmentRequestFields = z.infer<typeof appointmentRequestFieldsSchema>;
export interface AppointmentRequestInput {
  readonly name: string; readonly phone: string; readonly email: string | null; readonly serviceId: string | null;
  readonly preferredDate: string; readonly preferredWindow: AppointmentWindow; readonly note: string | null;
}
/** Field-level validation. Date availability is checked later against the business's calendar. */
export function parseAppointmentRequest(fields: AppointmentRequestFields):
  { success: true; data: AppointmentRequestInput } | { success: false; field: keyof AppointmentRequestFields; message: string };
export function isAppointmentHoneypotFilled(fields: AppointmentRequestFields): boolean; // website non-empty after trim
```

Rules:
- name: trimmed, 1–80.
- phone: trimmed, 5–30, only `[0-9+()\-\s.]`, at least 5 digits.
- email: optional; empty → null; otherwise `z.email()`, ≤200.
- serviceId: optional uuid; empty → null.
- preferredDate: ISO date.
- preferredWindow: one of APPOINTMENT_WINDOWS.
- note: optional, ≤300; empty → null.

Messages must be ones a patient can act on, e.g. "Enter your phone number."

- [ ] **Step 8: `appointments/settings-form.ts`**
  - `parseNotifyEmails(raw: string)`: split on commas, whitespace or newlines, dedupe (case-insensitive), 1–3 valid
    emails. Otherwise fail with "Add one to three email addresses."
  - `parsePausedMessage(raw)`: trimmed, ≤160, empty → null.
  - `parseServiceName(raw)`: trimmed, 1–80.

- [ ] **Step 9: Run** `pnpm --filter @fynix/shared test` and `pnpm --filter @fynix/shared typecheck`. All
  green.

---

### Task 2: Schema, migrations, grants

**Files:** the Schema and Migrations rows of the file map.

- [ ] **Step 1: `schema/modules.ts`**

```ts
export const businessModule = pgEnum("business_module", ["appointments"]);
/**
 * Which optional modules a business has. Only staff write here (the admin Features section). A row with
 * enabled = false remembers who last switched it off; no row means it was never on.
 */
export const businessModules = pgTable("business_modules", {
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  module: businessModule("module").notNull(),
  enabled: boolean("enabled").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  changedByUserId: text("changed_by_user_id").notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.businessId, table.module] })]);
```

- [ ] **Step 2: `businesses.timeZone`**: `timeZone: text("time_zone")`, nullable, with a doc comment: "IANA zone
  (Asia/Kolkata). Staff set it; appointments and announcement dates are read in it."

- [ ] **Step 3: `schema/business-facts.ts`**
  - **`business_closures`:** `id` uuidv7 pk, `business_id` fk, `starts_on` date, `ends_on` date, `note` text null,
    `created_at`.
    - Checks: `ends_on >= starts_on`; `note is null or char_length(note) between 1 and 80`.
    - Index `(business_id, ends_on)`.
  - **`business_announcements`:** `business_id` pk fk, `message` text, `starts_on` date, `ends_on` date,
    `updated_at` (`updatedAt()`).
    - Checks: `char_length(message) between 1 and 100`; `position(E'\n' in message) = 0`; `ends_on >= starts_on`.
  - Use `date("starts_on", { mode: "string" })` so dates travel as `YYYY-MM-DD` strings.

- [ ] **Step 4: `schema/appointments.ts`**
  - **Enums:** `appointment_status` and `appointment_window`, with the Task 1 values.
  - **`appointment_settings`:**
    - Columns: `business_id` pk fk, `accepting` bool default true, `paused_message` text null,
      `notify_emails` `text().array().notNull()`, `updated_at`.
    - Checks: `cardinality(notify_emails) between 1 and 3`; `paused_message is null or char_length(paused_message) between 1 and 160`.
  - **`appointment_services`:**
    - Columns: `id` uuidv7 pk, `business_id` fk, `name` text, `position` int, `created_at`, `archived_at`
      timestamptz null.
    - Check: `char_length(name) between 1 and 80`.
    - Index `(business_id, position)`.
  - **`appointment_requests`:**
    - Columns:
      - `id` uuidv7 pk, `business_id` fk
      - `patient_name`, `phone`, `email` null
      - `service_id` fk null, `service_name` null
      - `preferred_date` date(string), `preferred_window` enum
      - `patient_note` null, `status` enum default `new`
      - `scheduled_for_date` date(string) null, `scheduled_for_time` time null
      - `clinic_note` null, `decline_reason` null
      - `created_at`, `confirmed_at`, `suggested_at`, `declined_at`, `cancelled_at`, `done_at` (timestamptz null)
      - `handled_by_user_id` text fk users null
    - Checks:
      - name 1–80
      - phone 5–30
      - `patient_note` ≤300
      - `clinic_note` ≤500
      - `decline_reason` ≤200
      - `(status in ('confirmed','suggested','done')) = (scheduled_for_date is not null and scheduled_for_time is not null)`,
        so a scheduled status always has a time. A `cancelled` request keeps its schedule, so write this check to
        allow scheduled columns on `cancelled` too:
        `status in ('new','declined') and scheduled_for_date is null or status in ('confirmed','suggested','done') and scheduled_for_date is not null and scheduled_for_time is not null or status = 'cancelled'`
    - Index `(business_id, status, preferred_date)`.
- Export all of it from `schema/index.ts`.

- [ ] **Step 5: Generate the table migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --name business_modules_appointments`
Expected: `migrations/0041_business_modules_appointments.sql` plus a snapshot and journal entry. Read the SQL and
check it matches Steps 1–4.

- [ ] **Step 6: Write the grants migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --custom --name business_modules_appointments_grants`, then
fill `0042_business_modules_appointments_grants.sql`. Statements are separated by `--> statement-breakpoint`, like
`0014_onboarding_grants.sql`.

```sql
GRANT SELECT ON business_modules TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON business_modules TO fynix_staff;
ALTER TABLE business_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_modules_tenant_select ON business_modules FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
CREATE POLICY business_modules_staff_all ON business_modules FOR ALL TO fynix_staff USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON business_closures TO fynix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON business_closures TO fynix_staff;
ALTER TABLE business_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_closures_tenant_all ON business_closures FOR ALL TO fynix_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
CREATE POLICY business_closures_staff_all ON business_closures FOR ALL TO fynix_staff USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON business_announcements TO fynix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON business_announcements TO fynix_staff;
ALTER TABLE business_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_announcements_tenant_all ON business_announcements FOR ALL TO fynix_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
CREATE POLICY business_announcements_staff_all ON business_announcements FOR ALL TO fynix_staff USING (true) WITH CHECK (true);

-- Appointment tables: the customer reaches them only while the module is on, enforced here as well as in the app.
CREATE FUNCTION app_module_enabled(target_business uuid, target_module business_module) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM business_modules
      WHERE business_id = target_business AND module = target_module AND enabled)
  $$;
REVOKE ALL ON FUNCTION app_module_enabled(uuid, business_module) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_module_enabled(uuid, business_module) TO fynix_app, fynix_staff;

GRANT SELECT ON appointment_settings TO fynix_app;
GRANT UPDATE (accepting, paused_message, notify_emails, updated_at) ON appointment_settings TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON appointment_settings TO fynix_staff;
ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_settings_tenant_all ON appointment_settings FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
CREATE POLICY appointment_settings_staff_all ON appointment_settings FOR ALL TO fynix_staff USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON appointment_services TO fynix_app;
GRANT UPDATE (name, position, archived_at) ON appointment_services TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON appointment_services TO fynix_staff;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_services_tenant_all ON appointment_services FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
CREATE POLICY appointment_services_staff_all ON appointment_services FOR ALL TO fynix_staff USING (true) WITH CHECK (true);

GRANT SELECT ON appointment_requests TO fynix_app;
GRANT UPDATE (status, scheduled_for_date, scheduled_for_time, clinic_note, decline_reason, confirmed_at,
  suggested_at, declined_at, cancelled_at, done_at, handled_by_user_id) ON appointment_requests TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON appointment_requests TO fynix_staff;
ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_requests_tenant_all ON appointment_requests FOR ALL TO fynix_app
  USING (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'))
  WITH CHECK (business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments'));
CREATE POLICY appointment_requests_staff_all ON appointment_requests FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

Also check whether `businesses` has column-level grants that need `time_zone` added: `grep -n "businesses" packages/db/migrations/*grants*.sql`. If the app role's SELECT on `businesses` is column-listed, add `time_zone` to it.
The migrations run as the owner role. Check that the owner can create a SECURITY DEFINER function, as earlier
migrations do with `app_current_business_id`.

- [ ] **Step 7: Apply**

Run: `pnpm db:migrate && pnpm db:migrate:test`
Expected: "Migrations applied to the dev database." and the same for test. Then
`psql fynix_appt -c "\d appointment_requests"` shows the table and its policies.

- [ ] **Step 8: Run** `pnpm --filter @fynix/db typecheck`.

---

### Task 3: Queries + integration tests

**Files:** the Queries row. Export everything from `packages/db/src/index.ts`. Use the `Runner = Database |
ScopedTransaction` pattern (`queries/business-website.ts`) and `currentBusinessId(tx)` for customer-scoped
functions (see `queries/onboarding-data.ts`). Every error is a named class.

- [ ] **Step 1: `queries/business-modules.ts`**

```ts
export class InvalidTimeZoneError extends Error {}           // message names the value
export class ModuleNeedsTimeZoneError extends Error {}        // "Set the business's time zone before switching on appointments."
export async function setBusinessTimeZone(db: Runner, businessId: string, timeZone: string | null): Promise<void>;
export async function findBusinessTimeZone(db: Runner, businessId: string): Promise<string | null>;
export async function listEnabledModules(db: Runner, businessId: string): Promise<BusinessModule[]>;
export async function isModuleEnabled(db: Runner, businessId: string, module: BusinessModule): Promise<boolean>;
export interface ModuleChange {
  readonly businessId: string; readonly module: BusinessModule; readonly enabled: boolean;
  readonly staffUserId: string; readonly now: Date;
}
/**
 * Staff connection only. Switching appointments on the first time also creates its settings (notifying the
 * business owner's email) and seeds booking services from the business's live onboarding services, all in one
 * transaction. Switching off never deletes anything.
 */
export async function setBusinessModule(db: Database, change: ModuleChange): Promise<void>;
```

`setBusinessModule` in one `db.transaction`:
- **Enabling without a time zone:** throw `ModuleNeedsTimeZoneError`.
- **Write the module row:** upsert `business_modules` (`onConflictDoUpdate` on the pk).
- **When enabling appointments:**
  - Insert `appointment_settings` with `notify_emails = [owner email]`, `on conflict do nothing`. The owner email
    comes from `business_members` role `owner` joined to `users.email`. With no owner, throw
    `ModuleOwnerMissingError`.
  - If the business has no `appointment_services` rows at all, insert one per `services` row where
    `deleted_at is null`, keeping `position`.

- [ ] **Step 2: `queries/business-facts.ts`**

```ts
// customer (scoped tx)
export async function listClosures(tx: ScopedTransaction): Promise<ClosureRow[]>;          // by starts_on
export async function addClosure(tx: ScopedTransaction, input: { startsOn: string; endsOn: string; note: string | null }): Promise<ClosureRow>;
export async function deleteClosure(tx: ScopedTransaction, closureId: string): Promise<boolean>;
export async function findAnnouncement(tx: ScopedTransaction): Promise<AnnouncementRow | null>;
export async function saveAnnouncement(tx: ScopedTransaction, input: { message: string; startsOn: string; endsOn: string }): Promise<void>; // upsert
export async function clearAnnouncement(tx: ScopedTransaction): Promise<void>;
/** After launch: replaces the hours without the onboarding-project lock replaceBusinessHours takes. */
export async function replaceOpeningHours(tx: ScopedTransaction, rows: readonly BusinessHoursInput[]): Promise<BusinessHoursRow[]>;
// system (staff connection): everything a client site shows
export interface SiteFacts {
  readonly timeZone: string | null; readonly hours: readonly BusinessHoursRow[];
  readonly closures: readonly ClosureRow[]; readonly announcement: AnnouncementRow | null;
}
export async function readSiteFacts(db: Database, businessId: string): Promise<SiteFacts>;
```

- [ ] **Step 3: `queries/appointments.ts`**

```ts
// customer (scoped tx; RLS also requires the module to be on)
export async function findAppointmentSettings(tx: ScopedTransaction): Promise<AppointmentSettingsRow | null>;
export async function updateAppointmentSettings(tx: ScopedTransaction, input: Partial<{ accepting: boolean; pausedMessage: string | null; notifyEmails: readonly string[] }>): Promise<void>;
export async function listAppointmentServices(tx: ScopedTransaction, opts: { includeArchived: boolean }): Promise<AppointmentServiceRow[]>;
export async function addAppointmentService(tx: ScopedTransaction, name: string): Promise<AppointmentServiceRow>; // position = max+1
export async function renameAppointmentService(tx: ScopedTransaction, serviceId: string, name: string): Promise<boolean>;
export async function setAppointmentServiceArchived(tx: ScopedTransaction, serviceId: string, archived: boolean, now: Date): Promise<boolean>;
export async function listAppointmentRequests(tx: ScopedTransaction, group: AppointmentGroup, limit: number): Promise<AppointmentRequestRow[]>;
// new: created_at desc. upcoming: scheduled date asc, then time. past: coalesce(done_at, declined_at, cancelled_at) desc.
export async function countNewAppointmentRequests(tx: ScopedTransaction): Promise<number>;
export async function findAppointmentRequest(tx: ScopedTransaction, requestId: string): Promise<AppointmentRequestRow | null>;
export type AppointmentTransition =
  | { readonly action: "confirm" | "suggest"; readonly date: string; readonly time: string }
  | { readonly action: "decline"; readonly reason: string | null }
  | { readonly action: "done" };
/** One conditional UPDATE guarded by ACTION_ALLOWED_FROM. Null when the request was not in an allowed status (someone else moved it). */
export async function transitionAppointmentRequest(tx: ScopedTransaction, requestId: string, transition: AppointmentTransition, userId: string, now: Date): Promise<AppointmentRequestRow | null>;
export async function saveClinicNote(tx: ScopedTransaction, requestId: string, note: string | null): Promise<boolean>;
// system (staff connection)
export interface BookingContext {
  readonly enabled: boolean; readonly timeZone: string | null;
  readonly settings: AppointmentSettingsRow | null; readonly services: readonly AppointmentServiceRow[]; // unarchived
}
export async function readBookingContext(db: Database, businessId: string): Promise<BookingContext>;
export async function insertAppointmentRequest(db: Database, businessId: string, input: AppointmentRequestInput & { serviceName: string | null }): Promise<AppointmentRequestRow>;
export async function countAppointmentRequests(db: Database, businessId: string): Promise<{ total: number; new: number }>;
```

`transitionAppointmentRequest` builds the `SET` per action:
- **confirm:** status `confirmed`, schedule, `confirmed_at`.
- **suggest:** status `suggested`, schedule, `suggested_at`.
- **decline:** `statusAfter("decline", from)`. This needs to know the current row, so use two guarded updates: one
  `WHERE status IN ('new','suggested')` → `declined` + `declined_at`; if that updates nothing, one
  `WHERE status = 'confirmed'` → `cancelled` + `cancelled_at`. Both set `decline_reason`.
- **done:** status `done`, `done_at`.

It always sets `handled_by_user_id`. The WHERE always includes `business_id = currentBusinessId` and
`status = ANY(ACTION_ALLOWED_FROM[action])`.

- [ ] **Step 4: Integration tests** (`business-modules.integration.test.ts`, `business-facts.integration.test.ts`,
  `appointments.integration.test.ts`). Follow `business-website.integration.test.ts` for setup. Seed two
  businesses A and B, each with an owner user and membership, through `dbs.staff.db`. Cases:
  1. **Enabling appointments:**
     - Enabling without a time zone throws `ModuleNeedsTimeZoneError`.
     - With a time zone it creates settings (owner email) and seeds services from live `services`, skipping deleted
       ones.
     - Enabling again doesn't duplicate services.
     - Disabling keeps the settings and services.
  2. **Module switch permissions:** `fynix_app` under A's scope can read A's `business_modules` and not B's. An
     INSERT into `business_modules` as `fynix_app` fails with a permission error.
  3. **Closures and announcements RLS:**
     - A can add, list and delete its own closures and can't see or delete B's.
     - `saveAnnouncement` upserts, and the message check rejects 101 characters and newlines.
  4. **Appointment RLS:**
     - With the module off, A's scoped `listAppointmentRequests` returns nothing even though rows exist (inserted by
       staff).
     - With it on, A sees only A's rows.
     - `fynix_app` can't INSERT into `appointment_requests`.
  5. **Transitions:**
     - confirm from `new` works and sets the schedule.
     - done from `new` returns null.
     - decline from `confirmed` gives `cancelled`.
     - A second confirm after done returns null.
     - Updating B's request id under A's scope returns null.
  6. **Reads for the site:** `readSiteFacts` and `readBookingContext` return archived-filtered services and the time
     zone.

Run: `pnpm test:integration`. Expected: all pass, including the existing suites.

---

### Task 4: Email templates

**Files:** `packages/email/src/templates/appointment-*.ts`, `src/index.ts`, `src/templates/templates.test.ts`.
Follow `lead-received.ts` exactly: a pure function returning `EmailMessage`, `escapeHtml` on every interpolated
value, `sanitizeHeaderValue` on the subject, `assertWebUrl` on links, `htmlDocument` for the body.

- [ ] **Step 1: The four templates**
  - `appointmentRequestedEmail({ to, businessName, patientName, phone, email, serviceName, preferredDate, preferredWindowLabel, note, dashboardUrl })`
    - Subject: `New appointment request: <patientName>`. Put no patient note in the subject.
    - The body lists the details and links to `dashboardUrl`.
  - `appointmentConfirmedEmail({ to, businessName, patientName, date, time, businessPhone })`
    - Subject: `Your appointment with <businessName> is confirmed`.
  - `appointmentSuggestedEmail({ to, businessName, patientName, date, time, businessPhone })`
    - Subject: `<businessName> suggested a new time`.
    - The body asks them to call to confirm.
  - `appointmentDeclinedEmail({ to, businessName, patientName, reason, businessPhone })`
    - Subject: `About your appointment request with <businessName>`.
  - Dates show as, e.g., "Monday 28 September 2026" (format from the ISO string in UTC so it can't shift) and times
    as "10:30".
  - `businessPhone` may be null. Leave that line out when it is.
- [ ] **Step 2: Tests:** each template escapes `<script>` in patient-supplied text, has a non-empty `bodyText`, and
  keeps the note out of the subject.
- [ ] **Step 3: Run** `pnpm --filter @fynix/email test` and typecheck.

---

### Task 5: Site API (info + intake)

**Files:** the Site API row.

- [ ] **Step 1: Contracts** (`apps/platform/lib/site-info.ts`, `apps/platform/lib/site-appointments.ts`). Each gets
  a header comment: "ADDITIVE CHANGES ONLY: client sites deploy on their own schedule and keep a copy of this file."
  - `SiteInfo`: the exact type from the spec's "Site API" section.
  - `siteAppointmentRequestSchema = z.object({ fields: appointmentRequestFieldsSchema, clientIp: z.string().min(1).max(64) })`.
  - `SiteAppointmentResponse`:
    `{ status: "sent" } | { status: "error"; code: "invalid" | "paused" | "unavailable" | "limited" | "failed"; message: string; field: string | null }`.

- [ ] **Step 2: `lib/server/site-cors.ts`.** Move `CORS_HEADERS`, `bearerToken` and `unauthorized` out of
  `app/api/site/posts/route.ts` into this module, parameterised by allowed methods. Use them from the posts route
  (behaviour unchanged) and the two new routes.

- [ ] **Step 3: `lib/server/site-info.ts`**: `buildSiteInfo(tenant, facts, booking, now): SiteInfo`, pure except
  for its inputs.
  - Today is `localDateIn(timeZone ?? "UTC", now)`.
  - `announcement`: `activeAnnouncement`, returning `{ message, endsOn }`.
  - `closures`: `upcomingClosures`.
  - `booking`: null unless enabled with settings. Services are `{ id, name }`.

  Unit-test it with fixed dates.

- [ ] **Step 4: `app/api/site/info/route.ts`**: `GET` and `OPTIONS`.
  - Resolve the token with `findTenantBySiteToken`, then `readSiteFacts` and `readBookingContext` on `getStaffDb()`.
  - Headers: `Cache-Control: public, max-age=60` and CORS.
  - Add this route and the intake route to the sanctioned `getStaffDb()` list in `lib/server/db.ts`, each with a
    one-line reason.

- [ ] **Step 5: `lib/server/appointment-intake.ts`**:
  `handleAppointmentRequest(request, deps): Promise<Response>`, modelled on `lead-intake.ts`.
  - **Deps:**
    `{ findTenant(token): Promise<SiteApiTenant | null>; record(businessId, fields, clientIp, now): Promise<AppointmentRecordOutcome> }`.
  - **Order of checks:**
    1. 405 unless POST.
    2. 401 on a missing or unknown bearer token.
    3. 415 unless JSON.
    4. 413 over 16 KB, using `readLimitedBody`.
    5. 400 on the wrong shape.
    6. Honeypot → 200 `{status:"sent"}`, nothing stored.
    7. `parseAppointmentRequest` failure → 422 `invalid` with the field.
    8. `record(...)`, mapped by `AppointmentRecordOutcome`.
  - **Outcomes:**
    - `{ kind: "recorded" }` → 200
    - `{ kind: "unavailable" }` → 403
    - `{ kind: "paused"; message }` → 409
    - `{ kind: "invalid"; field; message }` → 422
    - `{ kind: "limited" }` → 429
    - `{ kind: "failed" }` → 500
  - **Headers:** `no-store` on every response. No CORS: the endpoint is server-to-server, so a browser calling it
    directly gets no CORS allowance.

- [ ] **Step 6: `lib/server/appointments.ts`**:
  `recordAppointmentRequest(businessId, fields: AppointmentRequestInput, clientIp, now)`.
  1. `readBookingContext(getStaffDb(), businessId)`. If the module is off, the time zone is missing or there are no
     settings → `unavailable`. If not accepting → `paused` with `pausedMessage ?? "Online booking is paused. Please call us."`.
  2. Rate limits via `consumeRateLimit(getStaffDb(), …)`: `appt:business:<id>` 200 a day, `appt:ip:<ip>` 5 an hour,
     `appt:phone:<id>:<digits only>` 3 a day. Any refusal → `limited`.
  3. `serviceId` must be one of the context's services, otherwise `invalid` on `serviceId` ("Choose a service from
     the list."). Snapshot the service name.
  4. `bookingDateProblem(preferredDate, { today: localDateIn(tz, now), hours, closures })` returns a message →
     `invalid` on `preferredDate`. Hours and closures come from `readSiteFacts`.
  5. `insertAppointmentRequest`.
  6. Best-effort `appointmentRequestedEmail` to each notify address through `createOutboxTransport(getPublicDb())`,
     with `dashboardUrl = new URL("/appointments", serverEnv().APP_ORIGIN)`. Log failures and never undo the insert.

  Any thrown error is logged → `failed`.

- [ ] **Step 7: `app/api/site/appointments/route.ts`**:
  `POST = (request) => handleAppointmentRequest(request, { findTenant: findTenantBySiteToken, record: recordAppointmentRequest })`.

- [ ] **Step 8: `appointment-intake.test.ts`**. Mock deps (the `vi.mock("server-only")` pattern) and cover:
  - 405, 401 missing, 401 unknown, 415, 413, 400
  - honeypot 200 with `record` not called
  - 422 on a bad phone
  - each outcome's status and body
  - that `record` receives the tenant's businessId, never anything from the body

- [ ] **Step 9: Run** `pnpm --filter @fynix/platform test`, `pnpm --filter @fynix/platform lint`,
  `pnpm typecheck`.

---

### Task 6: Admin: Features section and lead hint

**Files:** `apps/admin/components/client-features.tsx`, the client page and actions, and the lead detail page
(`apps/admin/app/(protected)/leads/[leadId]/page.tsx`).

- [ ] **Step 1: Actions** in `clients/[businessId]/actions.ts`, following `setWebsiteUrlAction`:
  - `setTimeZoneAction(formData)`: `requireStaffAccess()`, then `readId`. Accept only a value that passes
    `isValidTimeZone` or is empty (→ null), else redirect `?features=bad-zone`. Then `setBusinessTimeZone`,
    `revalidateClient` and redirect `?features=zone-saved`.
  - `setModuleAction(formData)`: reads `module` (`isBusinessModule`) and `enabled` (`"on"`/`"off"`). Calls
    `setBusinessModule` with `staffUserId = user.id` and `now`. Map `ModuleNeedsTimeZoneError` →
    `?features=needs-zone`; otherwise `?features=on|off`.
  - Notice copy lives in `packages/shared/src/lib/business-module-notices.ts`, in the style of
    `project-preview-notices.ts`.
- [ ] **Step 2: `ClientFeatures` component** (server component), with props `{ businessId, timeZone, enabled, counts, notice }`:
  - A time zone `<select>` of `Intl.supportedValuesOf("timeZone")` with the current value selected, and Save.
  - An Appointments row showing On/Off and a switch button (form posting `enabled=on|off`).
    - Turning it off needs a confirm checkbox: "I understand their booking form stops taking requests".
    - With no time zone the "Switch on" button is disabled, labelled "Set a time zone first".
  - When on: "`new` new · `total` total".
- [ ] **Step 3: Client page:** load `findBusinessTimeZone`, `listEnabledModules` and `countAppointmentRequests` in
  the existing `Promise.all`. Render `<Section title="Features">` right after "Their website".
- [ ] **Step 4: Lead page:** under the business type, render `Suggested: Appointments` (using
  `suggestedModules(lead.businessType)` and the labels) when non-empty.
- [ ] **Step 5: Run** `pnpm --filter @fynix/admin test`, `pnpm --filter @fynix/admin lint`, `pnpm typecheck`.

---

### Task 7: Customer "Your details" (hours, closures, announcement): every client

**Files:** `apps/platform/app/app-host/(protected)/details/{page.tsx,actions.ts}`, `customer-shell.tsx`.

- [ ] **Step 1: Actions** (`"use server"`), each `(prev, formData) => Promise<{ ok: true } | { ok: false; message; field }>`:
  - `saveHoursAction`: reuse `parseBusinessForm`'s hours parsing. Extract a `parseHoursForm(formData)` from
    `lib/onboarding/business-form.ts` if it isn't separable yet, keeping `parseBusinessForm`'s behaviour. Then
    `withTenantScope(getAppDb(), tenant, tx => replaceOpeningHours(tx, hours.map(toStoredHours)))`.
  - `addClosureAction`, `deleteClosureAction` (closure id via `z.uuid()`), `saveAnnouncementAction`,
    `clearAnnouncementAction`.
  - All go through `paidCustomerOrNull()` (see `content/blog/actions.ts`). The business always comes from the
    session. Revalidate `/details`.
- [ ] **Step 2: Page** `/details`, titled "Your details", in three parts separated by hairlines:
  1. **Announcement:** a one-line input with a live `n/100` counter and two dates. When one is active, it shows
     "Showing until <date>" and a Remove button.
  2. **Closures:** add a date range plus an optional note, and list upcoming ones with Remove.
  3. **Opening hours:** reuse `HoursEditor` (`components/panel/hours-editor.tsx`) with the saved hours.

  Client components for the forms use `useActionState`. Labels stay short and there are no explanatory paragraphs.
- [ ] **Step 3: Nav:** add `{ href: "/details", label: "Your details", icon: <ClockIcon/> }` after "Your project".
  Use an existing icon from `@fynix/shared/ui/icons`. If none fits, add one there in the same style.
- [ ] **Step 4: Run** platform test, lint and typecheck.

---

### Task 8: Customer Appointments inbox + settings

**Files:** `apps/platform/app/app-host/(protected)/appointments/{page.tsx,actions.ts,settings/page.tsx,settings/actions.ts}`,
components under `apps/platform/components/panel/appointments/`, and `apps/platform/lib/server/business-modules.ts`.

- [ ] **Step 1: `lib/server/business-modules.ts`**: `getEnabledModules = cache(async () => …)`, using
  `requireCustomerAccess()` and then `listEnabledModules` under `withTenantScope(getAppDb(), …)`. Also
  `requireModule("appointments")`, which calls `notFound()` when the module is off.
- [ ] **Step 2: Nav:** when appointments is on, add `{ href: "/appointments", label: "Appointments", icon }` after
  Home. Get the count of new requests via `countNewAppointmentRequests` and show it in the label as
  `Appointments · 3`. Check whether `SidebarNavItem` supports a badge; if not, append it to the label.
- [ ] **Step 3: Inbox page** `/appointments?view=new|upcoming|past` (default `new`):
  - A big number of new requests at the top, then segmented links New / Upcoming / Past.
  - Rows separated by hairlines. Each row shows:
    - the patient name, bold
    - service, preferred date and window (or the scheduled date and time)
    - `tel:` and `mailto:` links, the status label and the patient note
  - Row actions (client component, `useActionState`), by status:
    - **Confirm:** date and time inputs prefilled with the preferred date and `10:00`.
    - **Suggest time:** only when `new`.
    - **Decline:** optional reason.
    - **Done:** only when confirmed.
    - **Note:** private clinic note.
  - An empty state of one short line.
- [ ] **Step 4: Actions:**
  - `transitionAppointmentAction`: `paidCustomerOrNull()`, then zod-parse
    `{ requestId: uuid, action, date?: iso, time?: HH:MM, reason?: ≤200 }`. Run
    `transitionAppointmentRequest` under `withTenantScope`.
    - If it returns null → `{ ok: false, message: "This request was already updated. Refresh to see it." }`.
    - After the write, if the patient gave an email, send `appointmentConfirmedEmail`,
      `appointmentSuggestedEmail` or `appointmentDeclinedEmail` (best-effort, `createOutboxTransport(getPublicDb())`).
      The business name comes from `tenant.businessName` and the phone from the business profile.
  - `saveClinicNoteAction`.
  - Each action checks `requireModule`-equivalent state. RLS already refuses when the module is off; also return
    `{ ok:false, message: "Appointments are switched off for your business." }` when
    `listEnabledModules` lacks it.
- [ ] **Step 5: Settings page** `/appointments/settings`:
  - An "Online booking" switch (accepting) with the paused message.
  - Services: add, rename, archive/restore.
  - Notification emails: a textarea, one per line.
  - Actions follow the same pattern, using the Task 1 settings parsers.
- [ ] **Step 6: Run** platform test, lint and typecheck.

---

### Task 9: Client-site kit on the test client site

**Setup:** in `/Users/siddiqueahmed/Desktop/AI/fynix-platform/fynix-test-client-site`, another session has
uncommitted blog work on `feat/blog-categories-seo`. Don't touch that checkout. Create a worktree:
`git -C ../fynix-test-client-site worktree add ../fynix-test-client-site-appt -b feat/appointments HEAD`,
then `pnpm install` and copy `.env.local`.

- [ ] **Step 1: Read** `lib/fynix-blog.ts` to match how it calls the platform (base URL env, token env,
  `revalidate`).
- [ ] **Step 2: `lib/site-info.ts`** (a verbatim copy of the platform contract) and
  `lib/site-appointments.ts` (the request and response types copied).
- [ ] **Step 3: `lib/fynix-info.ts`**: `getSiteInfo(): Promise<SiteInfo | null>`, fetched with
  `{ next: { revalidate: 60 } }` and the bearer token. On any failure it logs and returns null.
- [ ] **Step 4: `components/announcement-bar.tsx`** renders `info.announcement.message` as text at the top of the
  layout. Render it in `app/layout.tsx`.
- [ ] **Step 5: `components/opening-hours.tsx`**: the week (Monday first) plus upcoming closures, on the home page.
- [ ] **Step 6: `app/book/page.tsx` + `components/booking-form.tsx`:**
  - When `booking` is null → "Call us to book".
  - When not accepting → the paused message.
  - Otherwise the form: name, phone, email, service select, date (`min` today, `max` +90), window select, note
    ("Please don't include medical details"), and a hidden honeypot `website`.
  - It posts to `/api/book` and shows the field error or "Thanks, we'll call you to confirm."
- [ ] **Step 7: `app/api/book/route.ts`:**
  - Read the JSON body.
  - The client IP comes from `x-forwarded-for`'s first entry, or `127.0.0.1` locally.
  - POST to `${FYNIX_API_ORIGIN}/api/site/appointments` with the token, and relay the status and JSON.
  - Never forward the token to the browser.
- [ ] **Step 8: Run** its `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

---

### Task 10: Local end-to-end

Servers go in `.claude/launch.json` in the worktree:
- **platform:** `pnpm --filter @fynix/platform exec next dev -p 3011`
- **admin:** `pnpm --filter @fynix/admin exec next dev -p 3013`
- **client site:** `pnpm exec next dev -p 3015` in the client-site worktree, with `FYNIX_API_ORIGIN=http://localhost:3011`

- [ ] **Step 1:** Create a test business the real way.
  1. Submit a lead with type "Clinic" (POST `/api/leads` with `LEADS_API_TOKEN`) and see "Suggested: Appointments"
     on the admin lead page.
  2. Create a staff login with `pnpm staff:create` if needed.
  3. Convert the lead, redeem the setup link and register.
  4. Record a manual first payment in admin so writes are allowed.
- [ ] **Step 2:** In admin:
  1. See Switch on disabled without a time zone.
  2. Set `Asia/Kolkata` and switch Appointments on.
  3. Generate the site token and put it in the client site's `.env.local`.
- [ ] **Step 3:** In the dashboard, in Your details:
  1. Add an announcement for today to +2 days.
  2. Add a closure on a date next week.
  3. Set Sunday closed.
  4. Within about 60 s the client site shows the bar, the hours and the closure.
- [ ] **Step 4:** On the client site `/book`:
  1. Submit a valid request. It shows in the Appointments inbox as New with the count, and the admin outbox has the
     clinic email.
  2. Submit on the closure date and on a Sunday. Each is refused with the message.
  3. Submit six times quickly. The sixth is limited.
  4. Submit with the honeypot filled. It shows "Thanks" but nothing is stored.
- [ ] **Step 5:** In the inbox:
  1. Confirm the request. The status is Confirmed and the outbox has the patient email.
  2. Mark done.
  3. Decline a second request.
  4. Replaying a confirm on a done request shows "already updated".
- [ ] **Step 6:**
  1. Pause booking. The site shows the paused message and a direct POST gets 409.
  2. Switch the module off in admin. The site shows "Call us", the dashboard tab is gone, `/appointments` 404s and
     the data is still in the DB.
- [ ] **Step 7:** Full checks:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm build`
  - the client site's lint, typecheck, test and build

  Record the results.
