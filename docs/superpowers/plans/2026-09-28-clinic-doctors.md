# Clinic Doctors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a clinic list several doctors, each with a schedule and leave, and let patients book "any doctor" or a
specific one (spec: `docs/superpowers/specs/2026-09-28-clinic-doctors-design.md`).

**Architecture:** A new `practitioners` table (plus hours and leave) hangs off the business; every appointment points
at one practitioner. The pure slot engine builds one calendar per practitioner with the existing
`buildWeekAvailability`, then merges them into the same `SiteAvailability` shape the website already renders, and
also reports which practitioners are free per slot. `bookSlot` picks the doctor inside its existing advisory lock.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing/actions), Drizzle 0.45 +
drizzle-kit 0.31, Postgres 14 with RLS, zod 4, Vitest.

**Repos:**
- Platform: worktree `/Users/siddiqueahmed/Desktop/AI/first-found/appointments-spec` (branch
  `docs/appointments-module-spec`). Branch databases: `webfold_appt`, `webfold_appt_test`.
- Client site: `/Users/siddiqueahmed/Desktop/AI/first-found/firstfold-test-client-site-appt` (branch `feat/appointments`).

**House rules:**
- **Never commit or push.** The user commits only when they ask. Replace every "Commit" step with "leave uncommitted".
- Match surrounding code: long doc comments that say *why*, `readonly` everywhere, no `any`, explicit return types.
- Contract files (`apps/platform/lib/site-info.ts`, `apps/platform/lib/site-bookings.ts` and their copies in the client
  site `lib/`) are ADDITIVE ONLY and must stay byte-identical between the two repos.
- Checks per task (platform): `pnpm --filter <pkg> exec vitest run <file>`; at the end `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm --filter @firstfold/db test:integration`, `pnpm build`. Client site: `npm run lint`,
  `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

---

## File map

**packages/db**
- `src/schema/practitioners.ts` (new): `practitioners`, `practitionerHours`, `practitionerLeave`.
- `src/schema/appointments.ts`: `practitionerId` column, composite FK, per-practitioner unique index.
- `src/schema/media.ts`: `practitioner` purpose (Task 12 only).
- `migrations/0044_clinic_practitioners.sql` (generated, then hand-edited for the backfill),
  `migrations/0045_clinic_practitioners_grants.sql` (custom).
- `src/queries/practitioners.ts` (new): customer CRUD + system reads.
- `src/queries/appointments.ts`: `practitionerId` on rows, busy intervals per practitioner, `bookSlot` candidates,
  `reassignAppointment`.
- Wherever the appointments module is switched on and `appointment_settings` is seeded: also seed a default
  practitioner (find with `git grep -n "insert(appointmentSettings)"`).

**packages/shared**
- `src/lib/appointments/slots.ts`: grid-aligned slot starts.
- `src/lib/appointments/clinic-availability.ts` (new): merge per-practitioner weeks.
- `src/lib/appointments/practitioner-form.ts` (new): parse doctor name/title.
- `src/lib/appointments/booking-form.ts`: optional `practitionerId`.

**apps/platform**
- `lib/site-info.ts`, `lib/site-bookings.ts`: additive contract fields.
- `lib/server/clinic-calendars.ts` (new): load practitioners + busy into `PractitionerCalendar[]`.
- `lib/server/availability.ts`, `lib/server/slot-check.ts`, `lib/server/booking-otp.ts`,
  `lib/server/booking-confirm.ts`, `app/api/site/availability/route.ts`, the site-info builder.
- `app/app-host/(protected)/appointments/doctors/{page.tsx,actions.ts,commands.ts}` (new) +
  `components/panel/appointments/doctors-*.tsx` (new).
- `app/app-host/(protected)/appointments/page.tsx` + `components/panel/appointments/{appointments-grid,booking-details-panel}.tsx`:
  doctor filter, initials, Today columns, reassign.

**apps/admin**: client page Features: doctor count.

**client site**: `lib/site-info.ts`, `lib/site-bookings.ts`, `lib/site-info-guard.ts`, `lib/book-forward.ts`,
`lib/availability-forward.ts`, `lib/confirm-forward.ts`, `app/book/page.tsx`, `components/booking-week.tsx`,
`components/booking-form.tsx`, new `components/doctor-picker.tsx`.

---

### Task 1: Schema and migration 0044 (tables + backfill)

**Files:** create `packages/db/src/schema/practitioners.ts`; modify `packages/db/src/schema/appointments.ts`,
`packages/db/src/schema/index.ts`; generate `packages/db/migrations/0044_clinic_practitioners.sql`.

- [ ] **Step 1: Schema.** Model on `appointmentServices` (same file) and `businessHours`/`businessClosures`
  (`src/schema/business-facts.ts`):

```ts
export const practitioners = pgTable(
  "practitioners",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    name: text("name").notNull(),
    title: text("title"),
    photoMediaId: uuid("photo_media_id"),
    usesClinicHours: boolean("uses_clinic_hours").notNull().default(true),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("practitioners_business_id_id_key").on(table.businessId, table.id),
    index("practitioners_business_id_position_idx").on(table.businessId, table.position),
    check("practitioners_name_check", sql`char_length(${table.name}) between 1 and 80`),
    check("practitioners_title_check", sql`${table.title} is null or char_length(${table.title}) between 1 and 80`),
  ],
);
```

  `practitionerHours`: `id`, `businessId`, `practitionerId`, plus exactly the `business_hours` columns and checks
  (`day_of_week`, `opens_at`, `closes_at`, `closed`, `open_all_day`), composite FK `(business_id, practitioner_id)`
  → `practitioners (business_id, id)`. `practitionerLeave`: `id`, `businessId`, `practitionerId`, `starts_on`,
  `ends_on`, `note`, the same checks as `business_closures`, same composite FK. Reuse whatever id helper
  the neighbouring tables use (copy from `appointmentServices`).

  In `appointments`: add `practitionerId: uuid("practitioner_id").notNull()`, a composite foreign key
  `appointments_practitioner_business_fk` `(business_id, practitioner_id)` → `practitioners (business_id, id)`, and
  replace `appointments_business_id_starts_at_idx` with
  `uniqueIndex("appointments_practitioner_id_starts_at_idx").on(table.practitionerId, table.startsAt).where(sql\`${table.status} <> 'cancelled'\`)`
  plus `index("appointments_business_id_starts_at_idx").on(table.businessId, table.startsAt)` (non-unique, keeps the
  busy-interval scans on an index). Update the doc comment above the index.

- [ ] **Step 2: Generate.** `pnpm --filter @firstfold/db db:generate --name clinic_practitioners`. Expected: a new
  `0044_clinic_practitioners.sql` and `meta/0044_snapshot.json`.

- [ ] **Step 3: Hand-edit the backfill into 0044.** drizzle-kit will emit `ADD COLUMN "practitioner_id" uuid NOT NULL`,
  which fails on existing rows. Reorder the file so it: creates the three tables → adds the column **nullable** →
  runs the backfill → sets NOT NULL → adds the FKs and the new indexes → drops the old unique index:

```sql
INSERT INTO practitioners (id, business_id, name, position)
SELECT gen_random_uuid(), s.business_id, left(b.name, 80), 0
FROM appointment_settings s JOIN businesses b ON b.id = s.business_id;
--> statement-breakpoint
UPDATE appointments a SET practitioner_id = p.id FROM practitioners p WHERE p.business_id = a.business_id;
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "practitioner_id" SET NOT NULL;
```

  (Check the businesses name column's real name in `src/schema/businesses.ts`; if the table has a separate "name on
  website", prefer that one.) Appointments whose business has no settings row cannot exist (bookings need settings),
  but guard anyway: the NOT NULL step fails loudly, which is what we want.

- [ ] **Step 4: Apply to the branch DBs.** `pnpm db:migrate` and `pnpm db:migrate:test` (both read `.env.local`;
  confirm the URLs point at `webfold_appt` / `webfold_appt_test` before running). Expected: "migrations applied".
  Then `psql -d webfold_appt -c "select count(*) from practitioners"` equals the number of rows in
  `appointment_settings`.

### Task 2: Grants and RLS (0045)

**Files:** `packages/db/migrations/0045_clinic_practitioners_grants.sql` via
`pnpm --filter @firstfold/db db:generate --custom --name clinic_practitioners_grants`.

- [ ] **Step 1: Write the integration test first** in `packages/db/src/appointments.integration.test.ts` (or a new
  `practitioners.integration.test.ts` using the same setup helpers): as tenant A with the module on, can insert/list/
  update its practitioners, hours and leave; cannot see tenant B's; with the module off sees nothing; can update
  `appointments.practitioner_id` to its own practitioner but the composite FK refuses tenant B's practitioner.
- [ ] **Step 2: Run it**: fails (no grants).
- [ ] **Step 3: Write 0045** in the exact style of 0042:
  - `practitioners`: `GRANT SELECT, INSERT ON practitioners TO webfold_app`; `GRANT UPDATE (name, title,
    photo_media_id, uses_clinic_hours, position, archived_at) ON practitioners TO webfold_app` (no delete: past
    bookings point at it); `GRANT SELECT, INSERT, UPDATE ON practitioners TO webfold_staff`; enable RLS; tenant policy
    `business_id = app_current_business_id() AND app_module_enabled(business_id, 'appointments')` for USING and
    WITH CHECK; staff policy `USING (true) WITH CHECK (true)`.
  - `practitioner_hours` and `practitioner_leave`: `SELECT, INSERT, DELETE` for webfold_app (replace-all like
    business hours), `SELECT, INSERT, UPDATE, DELETE` for staff, same two policies.
  - `appointments`: `GRANT UPDATE (practitioner_id) ON appointments TO webfold_app` (reassign). Extend
    `appointments_guard_customer_transition` with `CREATE OR REPLACE FUNCTION` so that for webfold_app a change of
    `practitioner_id` is only allowed while `OLD.status = 'booked' AND NEW.status = 'booked'`, and add
    `practitioner_id` to the list of columns a status-changing update must leave untouched. Keep every existing
    guard verbatim.
  - If the admin console reads through a separate role, add SELECT on `practitioners` for it too (check how
    `appointment_services` is granted beyond 0042 with `git grep -n appointment_services packages/db/migrations`).
- [ ] **Step 4: Apply** (`pnpm db:migrate && pnpm db:migrate:test`) and run the integration test: PASS.

### Task 3: Seed a default practitioner when the module is switched on

- [ ] **Step 1: Test first.** In the integration test that covers switching the module on (find it with
  `git grep -n "appointment_settings\|enableAppointments\|setBusinessModule" packages/db/src/*.integration.test.ts`),
  assert that after switching on for a business with no practitioners there is exactly one, named after the
  business, `uses_clinic_hours = true`; switching off and on again does not create a second one.
- [ ] **Step 2:** In the same transaction that inserts `appointment_settings`, insert the practitioner when the
  business has none (`INSERT ... SELECT ... WHERE NOT EXISTS`).
- [ ] **Step 3:** Run: PASS.

### Task 4: Grid-aligned slots

**Files:** `packages/shared/src/lib/appointments/slots.ts`, `slots.test.ts`.

- [ ] **Step 1: Failing tests** in `slots.test.ts`:
  - hours 09:15–12:00 with 30-minute slots → first slot `09:30–10:00`, last `11:30–12:00`;
  - hours 09:00–13:00 with 30-minute slots → unchanged (`09:00`, …, `12:30`);
  - hours 14:00–18:00 with 45-minute slots → first slot `14:15` (840 is not a multiple of 45; 855 is).
- [ ] **Step 2: Run**: the three fail.
- [ ] **Step 3: Implement** in `slotsInRange`:

```ts
/** Slots on one grid for the whole clinic: each starts at a whole multiple of `slotMinutes` from midnight, so two
 * doctors whose shifts start at different times never produce overlapping slots in the merged "any doctor" grid.
 * The first slot is the first grid point at or after the range's start; a final slot that would run past the
 * range's end is dropped rather than shortened. */
function slotsInRange(range: OpenRange, slotMinutes: number): Array<{ startMinutes: number; endMinutes: number }> {
  const slots: Array<{ startMinutes: number; endMinutes: number }> = [];
  const firstStart = Math.ceil(range.startMinutes / slotMinutes) * slotMinutes;
  for (let start = firstStart; start + slotMinutes <= range.endMinutes; start += slotMinutes) {
    slots.push({ startMinutes: start, endMinutes: start + slotMinutes });
  }
  return slots;
}
```

  Update the `buildWeekAvailability` doc comment's rules list with the alignment rule.
- [ ] **Step 4: Run** `pnpm --filter @firstfold/shared exec vitest run src/lib/appointments`: all PASS (fix any
  existing test that asserted range-start alignment at an off-grid time, and say so in the summary).

### Task 5: Merge practitioner calendars (pure)

**Files:** create `packages/shared/src/lib/appointments/clinic-availability.ts` and
`clinic-availability.test.ts`.

- [ ] **Step 1: Types and signature:**

```ts
export interface PractitionerCalendar {
  readonly id: string;
  /** Already resolved: the clinic's hours when the doctor uses them, else the doctor's own. */
  readonly hours: readonly WeekAvailabilityHoursRow[];
  readonly leave: readonly WeekAvailabilityClosure[];
  readonly busy: readonly WeekAvailabilityBusy[];
}

export interface BuildClinicWeekInput extends Omit<BuildWeekAvailabilityInput, "hours" | "busy"> {
  /** Clinic closures stay in `closures` (inherited): a clinic holiday closes every doctor. */
  readonly practitioners: readonly PractitionerCalendar[];
}

export interface ClinicWeek {
  readonly availability: SiteAvailability;
  /** Keyed by `${date}T${start}`: the practitioner ids free for that slot, in `practitioners` order. */
  readonly freeBySlot: ReadonlyMap<string, readonly string[]>;
}

export function buildClinicWeek(input: BuildClinicWeekInput): ClinicWeek;
export function freePractitionersAt(week: ClinicWeek, date: string, start: string): readonly string[];
```

- [ ] **Step 2: Failing tests** (build inputs with a small helper; Monday 2026-10-05, `today` 2026-10-01,
  `nowMinutes` 0, 30-minute slots, horizon 28, notice 60):
  1. one practitioner → `availability` deep-equals `buildWeekAvailability` for the same hours/closures/busy;
  2. two doctors, A Mon 09–13, B Mon 14–18 → Monday shows slots 09:00–12:30 and 14:00–17:30; `freePractitionersAt`
     09:00 = `[A]`, 14:00 = `[B]`;
  3. both work Mon 09–13, A busy 09:00–09:30 → 09:00 is `free` with `[B]`; both busy → `taken` with `[]`;
  4. A on leave Monday, B works → Monday open with B's slots only; leave notes are never shown (`closedNote` null);
  5. clinic closure Monday with note "Diwali" → closed for everyone, `closedNote` "Diwali";
  6. every practitioner closed on a day with no clinic closure → `closed: true, closedNote: null`;
  7. zero practitioners → all seven days closed;
  8. past slots stay `past` (not `taken`) even when busy.
- [ ] **Step 3: Run**: fail (module missing).
- [ ] **Step 4: Implement.** For each practitioner call `buildWeekAvailability({ ...common, hours: p.hours,
  closures: [...input.closures, ...p.leave.map((l) => ({ ...l, note: null }))], busy: p.busy })`. Then per day:
  closed when every practitioner's day is closed (note: `closureOn(input.closures, date)?.note ?? null`, but `null`
  beyond the horizon — reuse the first practitioner-less rule by checking `date > addDays(today, horizonDays - 1)`);
  otherwise the union of slot starts sorted by start; state `free` if any practitioner has it `free`, else `taken`
  if any has it `taken`, else `past`. `previousWeek`/`nextWeek`/`weekStart`/`today`/`slotMinutes` come from any
  practitioner's result, or from a zero-practitioner call of `buildWeekAvailability` with empty hours when the list
  is empty. Record `freeBySlot` while merging.
- [ ] **Step 5: Run**: PASS.

### Task 6: Customer queries for practitioners

**Files:** create `packages/db/src/queries/practitioners.ts`, export from `packages/db/src/index.ts`; integration
tests in `packages/db/src/practitioners.integration.test.ts`.

- [ ] **Step 1: Failing integration tests** for each function below (tenant-scoped via `withTenantScope` as in the
  appointments tests): add appends at the end; update renames; replace hours is all-or-nothing; leave add/remove;
  move swaps positions; archive refused while the doctor has upcoming non-cancelled bookings (returns the count),
  refused for the last active doctor, allowed otherwise.
- [ ] **Step 2: Implement** (all `tx: ScopedTransaction`, business from `currentBusinessId(tx)`, invalid uuid → the
  "not found" result, mirroring the services functions):

```ts
export interface PractitionerRow { readonly id: string; readonly name: string; readonly title: string | null;
  readonly photoMediaId: string | null; readonly usesClinicHours: boolean; readonly position: number;
  readonly archivedAt: Date | null; }
export const MAX_ACTIVE_PRACTITIONERS = 20;
export async function listPractitioners(tx, opts: { readonly includeArchived: boolean }): Promise<PractitionerRow[]>;
export async function addPractitioner(tx, input: { readonly name: string; readonly title: string | null }):
  Promise<{ readonly kind: "added"; readonly practitioner: PractitionerRow } | { readonly kind: "limit" }>;
export async function updatePractitioner(tx, id: string, input: { readonly name: string; readonly title: string | null }): Promise<boolean>;
export async function setPractitionerSchedule(tx, id: string, input:
  { readonly usesClinicHours: true } | { readonly usesClinicHours: false; readonly hours: readonly NewHoursRow[] }): Promise<boolean>;
export async function listPractitionerHours(tx, id: string): Promise<StoredHoursRow[]>;
export async function listPractitionerLeave(tx, id: string): Promise<LeaveRow[]>;
export async function addPractitionerLeave(tx, id: string, leave: { startsOn: string; endsOn: string; note: string | null }): Promise<LeaveRow | null>;
export async function removePractitionerLeave(tx, leaveId: string): Promise<boolean>;
export async function movePractitioner(tx, id: string, direction: "up" | "down"): Promise<boolean>;
export async function archivePractitioner(tx, id: string, now: Date):
  Promise<{ readonly kind: "archived" } | { readonly kind: "has_upcoming"; readonly count: number } | { readonly kind: "last" } | { readonly kind: "not_found" }>;
```

  Reuse the hours row types and the replace-all pattern from `src/queries/business-facts.ts` (`replaceOpeningHours`)
  instead of redefining them; `LeaveRow` mirrors the closures row type.
- [ ] **Step 3: Run**: PASS.

### Task 7: System reads, busy per practitioner, bookSlot assignment, reassign

**Files:** `packages/db/src/queries/practitioners.ts`, `packages/db/src/queries/appointments.ts`, integration tests.

- [ ] **Step 1: Failing integration tests:**
  - `readPractitionerSchedules(db, businessId)` returns active practitioners in order with hours and leave;
  - `listBusyIntervals` rows now carry `practitionerId`;
  - `bookSlot` with `practitionerIds: [A, B]` when A already has a booking at that time → books B;
  - with `[A, B]` both free and A having more bookings that day → books B; equal counts → A (given order);
  - with `[A]` and A busy → `SlotTakenError`;
  - two concurrent `bookSlot` calls with `[A, B]` for the same slot → one lands on A, the other on B;
  - `reassignAppointment(tx, id, B)` moves a booked appointment when B is free at that time, returns `"taken"` when
    B is busy, `"not_found"` for another tenant's doctor or a cancelled booking.
- [ ] **Step 2: Implement.**
  - `AppointmentRow` and `APPOINTMENT_COLUMNS` gain `practitionerId`; `BusyInterval` gains `practitionerId`.
  - `NewAppointment` gains `readonly practitionerIds: readonly string[]` (the caller's schedule-checked candidates,
    in `position` order). Inside the lock, after the module/accepting re-check: count that day's non-cancelled
    bookings per candidate (`local_date = input.localDate`), stable-sort candidates by count, then for each run the
    existing overlap query with `eq(appointments.practitionerId, candidate)` added; insert for the first free one.
    None free → `SlotTakenError`. The unique-violation mapping stays. Update the long doc comment accordingly.
  - `reassignAppointment(tx, id, practitionerId, now)` in the tenant scope: `pg_advisory_xact_lock` on the same key
    as `bookSlot`, load the booking (must be `booked` and start after `now`), check the target is an active
    practitioner of this business with no overlapping non-cancelled booking, then update `practitioner_id`.
    Returns `"reassigned" | "taken" | "not_found"`. The schedule check (is B working then?) is done by the caller
    with the pure engine, since hours live in the shared package.
  - `readPractitionerSchedules(db, businessId)` (staff connection, active only).
- [ ] **Step 3: Run**: PASS. Fix every compile error the new required fields cause across the platform tests
  (add `practitionerId` to row fixtures; `practitionerIds` to `bookSlot` inputs).

### Task 8: Contracts, site API and booking flow

**Files:** platform `lib/site-info.ts`, `lib/site-bookings.ts` (and copy both to the client site `lib/`),
`packages/shared/src/lib/appointments/booking-form.ts`, new `apps/platform/lib/server/clinic-calendars.ts`,
`lib/server/availability.ts`, `lib/server/slot-check.ts`, `lib/server/booking-otp.ts`,
`lib/server/booking-confirm.ts`, `app/api/site/availability/route.ts`, the site-info builder
(`git grep -n "booking:" apps/platform/lib/server` to find it), `BookingOtpPayload` in packages/db.

- [ ] **Step 1: Contract additions** (both copies identical; keep the ADDITIVE ONLY header):

```ts
export interface SiteInfoPractitioner {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  /** Absolute URL of a square photo, or null to show initials. */
  readonly photoUrl: string | null;
}
// SiteInfoBooking gains:
  /** Active doctors in the clinic's order. Missing from platforms older than 2026-09-28. */
  readonly practitioners?: readonly SiteInfoPractitioner[];
// SiteBookingFields gains:
  /** Null or missing: any doctor. */
  readonly practitionerId?: string | null;
// SiteConfirmResponse's booked branch gains:
  readonly practitionerName?: string | null;
```

  `GET /api/site/availability` accepts `practitioner=<uuid>`.
- [ ] **Step 2: Failing tests:**
  - `booking-form.test.ts`: `practitionerId` accepted as a uuid, blank → null, non-uuid → `{ field: "practitionerId",
    message: "Choose a doctor from the list." }`;
  - `availability.test.ts`: `buildAvailabilityResponse` with two calendars matches `buildClinicWeek`; an unknown
    practitioner param → `invalid_practitioner` outcome;
  - `slot-check` tests: returns `{ slot, freePractitionerIds }`; with a chosen doctor only that doctor counts;
  - `booking-otp.test.ts`: unknown/archived `practitionerId` → invalid with field `practitionerId`; payload carries
    `practitionerId` (null for any);
  - `booking-confirm.test.ts`: passes `practitionerIds` = the free ids (or `[chosen]`) to `bookSlot`; responds with
    `practitionerName`; a chosen doctor no longer free → taken;
  - site-info builder test: `booking.practitioners` lists active doctors in order, `photoUrl` null.
- [ ] **Step 3: Implement.**
  - `clinic-calendars.ts`: `loadClinicCalendars(db, businessId, facts, fromUtc, toUtc, timeZone,
    onlyPractitionerId: string | null): Promise<{ practitioners: PractitionerScheduleRow[]; calendars: PractitionerCalendar[] }>`
    — reads `readPractitionerSchedules` + `listBusyIntervals`, groups busy by `practitionerId`, converts with
    `utcIntervalToLocal`, resolves `hours` to `facts.hours` when `usesClinicHours`.
  - `availability.ts`: `buildAvailabilityResponse(window, facts, calendars)` returns
    `buildClinicWeek(...).availability`. The route reads `practitioner`, validates it is a uuid of an active
    practitioner (else 400 `{ code: "invalid", field: "practitioner", message: "Choose a doctor from the list." }`),
    and passes only that calendar when set.
  - `slot-check.ts`: `resolveRequestedSlot(context, facts, calendars, date, start, now)` →
    `{ readonly slot: SiteSlot; readonly freePractitionerIds: readonly string[] } | null`.
  - `booking-otp.ts`: validate `input.practitionerId`; load calendars for the day restricted to it when set; the
    payload gains `practitionerId: string | null` (`BookingOtpPayload` in packages/db too).
  - `booking-confirm.ts`: re-resolve, then `bookSlot(..., { ...newAppointmentFrom(payload), practitionerIds })`
    where `practitionerIds` is `freePractitionerIds` (already restricted when a doctor was chosen); empty → taken.
    Look up the booked practitioner's name for the response.
- [ ] **Step 4: Run** `pnpm --filter @firstfold/platform exec vitest run lib` and the shared tests: PASS. Update
  `site-bookings.contract-check.test.ts` if it enumerates keys.

### Task 9: Clinic dashboard: Doctors page

**Files:** create `apps/platform/app/app-host/(protected)/appointments/doctors/{page.tsx,actions.ts,commands.ts,
commands.test.ts}`, `packages/shared/src/lib/appointments/practitioner-form.ts` (+ test),
`apps/platform/components/panel/appointments/doctors-list.tsx`, `doctor-editor.tsx`; link from
`appointments/settings/page.tsx`.

- [ ] **Step 1:** Read `appointments/commands.ts`, `actions.ts`, `settings/page.tsx`,
  `components/panel/appointments/services-panel.tsx` and the Your details hours editor + closures panel
  (`components/panel/details/*`). Follow the same command/action/`usePanelForm` pattern; reuse the hours editor and
  closures panel by passing a different save action (add a prop if they hard-code theirs, without changing their
  current behaviour on Your details).
- [ ] **Step 2: Failing tests** for `parsePractitionerFields` (name 1–80 after `cleanLine`, "Enter the doctor's
  name."; title optional ≤ 80) and for each command: add (limit 20 → "You can list up to 20 doctors."), update,
  schedule (clinic hours / own hours via the existing hours parser), leave add/remove (existing closure parser),
  move, archive (`has_upcoming` → "Dr X has N upcoming bookings. Reassign or cancel them first."; `last` → "Keep at
  least one doctor."). After saving leave, the command returns the bookings that fall on it (name, date, time) so
  the page can list them.
- [ ] **Step 3: Implement** the commands, actions (revalidate `/appointments` and `/appointments/doctors`), and the
  page: doctors in order with name, title, "Clinic hours"/"Own hours" label, up/down, Archive; an Add form; each
  doctor opens an editor section (name/title, schedule radio + hours editor, leave list + add form). Follow the
  dashboard rule: whitespace and short labels, no boxed cards (memory: dashboards no boxes, no text).
- [ ] **Step 4: Run** unit tests; open `http://app-appt.localhost:3011/appointments/doctors` signed in as Aster
  Physio (see the session-minting note at the end) and add a second doctor with own hours.

### Task 10: Clinic dashboard: filter, initials, Today columns, reassign

**Files:** `apps/platform/app/app-host/(protected)/appointments/page.tsx`, `actions.ts`, `commands.ts`,
`components/panel/appointments/appointments-grid.tsx`, `appointments-list.tsx`, `booking-details-panel.tsx`.

- [ ] **Step 1: Failing tests:** a pure helper `filterByPractitioner(rows, id | null)`; initials helper
  (`"Dr Meera Iyer"` → `"MI"`, skipping a leading "Dr"/"Dr."); the reassign command (target must be in the free
  list computed with `buildClinicWeek` for that slot; maps `"taken"` → "That doctor isn't free then.").
- [ ] **Step 2: Implement:** `?doctor=<id>` search param (shown only with ≥ 2 active doctors: "All doctors", then
  each name); booking cards show initials when "All doctors"; the Today view renders one column per doctor; the
  details panel shows "With Dr X" and a Reassign select listing only doctors free at that time, plus Save.
- [ ] **Step 3: Run** tests, then check the page in the browser at 1440 and 390 wide.

### Task 11: Client site: doctor picker and wording

**Files (client site):** `lib/site-info.ts`, `lib/site-bookings.ts` (copies), `lib/site-info-guard.ts` (+ test),
`lib/availability-forward.ts` (+ test), `lib/book-forward.ts` (+ test), `lib/confirm-forward.ts` (+ test),
`app/api/availability/route.ts`, `app/book/page.tsx`, `components/booking-week.tsx`, `components/booking-form.tsx`,
new `components/doctor-picker.tsx`, `app/globals.css`.

- [ ] **Step 1: Failing tests:** the guard accepts `booking.practitioners` present or missing and rejects a malformed
  entry; `availability-forward` passes `practitioner` through only when it is a uuid; `whitelistFields` forwards
  `practitionerId`; the confirm forwarder keeps `practitionerName`.
- [ ] **Step 2: Implement:** `/book` reads site info; with ≥ 2 practitioners renders `DoctorPicker` above the week
  grid: "Any doctor" (default) then one card per doctor (photo or initials, name, title), as radio buttons in a
  `fieldset` with a legend "Doctor". The selected id goes into the availability request and the booking body. The
  pop-up shows "With Dr X" or "With the first available doctor" under the slot heading; the confirmation reads
  "You're booked with Dr X: Tuesday 29 September, 09:30 – 10:00." when `practitionerName` is present, else the
  current text.
- [ ] **Step 3: Run** the site's tests, lint, types, build.

### Task 12: Doctor photos

- [ ] **Step 1:** Read how onboarding uploads logo/photos (`git grep -n "mediaAssetPurpose\|purpose:" apps/platform`)
  and how (if at all) a media asset becomes a public URL. If a public URL path exists, add the `practitioner`
  purpose (migration 0046, generated), an upload control on the doctor editor that sets `photo_media_id`, and fill
  `photoUrl` in site info. If no public URL path exists yet, stop and report back instead of inventing one; photos
  stay as initials.

### Task 13: Staff console count, full checks, end-to-end

- [ ] **Step 1:** Admin client page Features: "N doctors" next to Appointments (staff connection count of active
  practitioners), with a test like the existing upcoming/total one.
- [ ] **Step 2:** Run every check listed under House rules, in both repos. All must pass.
- [ ] **Step 3:** E2E with screenshots (Playwright from `~/.claude/skills/gstack/node_modules/playwright-core`,
  sessions minted into `sessions` with user_agent `e2e-local-script` using `BETTER_AUTH_SECRET`; cookie
  `better-auth.session_token` = `encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token)))`): add
  "Dr Rahul Menon" with own hours Tue/Thu 14–18, book "any doctor" at a time only Meera works, book Rahul
  specifically, then see both in the clinic week with the doctor filter; reassign one; archive refusal message.

---

## Self-review notes

- Spec coverage: data model (1–3), availability rules and grid alignment (4–5), booking + assignment (7–8), website
  (11), dashboard doctors page, filter, Today columns, reassign, leave-over-bookings list (9–10), staff count (13),
  photos (12), errors (7–8 tests), testing (every task + 13).
- Types used across tasks: `PractitionerCalendar`, `buildClinicWeek`, `freePractitionersAt`, `PractitionerRow`,
  `readPractitionerSchedules`, `NewAppointment.practitionerIds`, `resolveRequestedSlot → { slot, freePractitionerIds }`,
  `SiteInfoPractitioner`, `practitionerId`, `practitionerName`.
