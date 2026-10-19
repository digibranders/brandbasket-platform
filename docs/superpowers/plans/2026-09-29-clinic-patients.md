# Clinic Patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A patient register for clinics (spec: `docs/superpowers/specs/2026-09-29-clinic-patients-design.md`).
Read the spec first; it is the source of truth for behaviour and wording.

**Architecture:** A `patients` table linked from `appointments.patient_id`. A BEFORE INSERT trigger on appointments
finds-or-creates the patient by phone, so every booking path links itself. The customer (fynix_app, RLS) reads
and edits patients, merges and erases them; the guard trigger on appointments is extended to allow exactly those
writes plus a new `no_show` outcome. Reception's "Add booking" runs `bookSlot` on the staff connection with the
business id from the session.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing/actions), Drizzle 0.45 +
drizzle-kit 0.31, Postgres 14 with RLS, zod 4, Vitest.

**Repo:** worktree `/Users/siddiqueahmed/Desktop/AI/fynix-platform/patients` (branch `feat/clinic-patients`, off
origin/development). Branch databases: `fynix_platform_branch` (dev), `fynix_platform_branch` (test), `fynix_platform_payload_pat`,
cloned from the appointments branch DBs and migrated to 0049; env files in `apps/platform/.env.local` and
`apps/admin/.env.local` already point at them. Local dev hosts: app-pat.localhost:3051, admin-pat.localhost:3053.

**House rules:**
- **Never commit or push.** Leave everything uncommitted.
- Match surrounding code: doc comments that say *why*, `readonly` everywhere, no `any`, explicit return types,
  tenant-scoped queries through `withTenantScope`, `currentBusinessId(tx)` + `isUuid` guards like
  `packages/db/src/queries/appointments.ts`.
- Migrations are hand-finished SQL in `packages/db/migrations` with drizzle meta (journal + snapshot) kept in sync:
  change the drizzle schema, run `pnpm --filter @brandbasket/db db:generate` for the table/column DDL, then append the
  hand-written parts (backfill, triggers, grants, RLS) in the same pattern as 0041/0042 and 0044/0045. Apply with
  `pnpm db:migrate && pnpm db:migrate:test` from the worktree root.
- Drizzle's migrator runs pending migrations in one transaction: a new enum value added with `ALTER TYPE ... ADD
  VALUE` cannot be used as a literal elsewhere in the same run. Compare `status::text = 'no_show'` in CHECKs; plpgsql
  bodies are fine (resolved at call time).
- UI rule from the user: no boxed cards, no explanatory paragraphs. Hairlines, whitespace, big numbers, short
  labels. Reuse `panel-title`, `panel-section`, `link-underline`, `FIELD_CLASSES`, `Button`, `usePanelForm`,
  `PanelFormStatus` exactly as `apps/platform/components/panel/appointments/*` do.
- Checks per task: targeted `vitest run`; the final task runs `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm --filter @brandbasket/db test:integration`, `pnpm build`.

---

## Task 1: Database — schema, migrations, queries

**Files:** `packages/db/src/schema/{patients.ts,appointments.ts,index.ts}`, migrations `0050_clinic_patients.sql`
(+ meta) and `0051_clinic_patients_grants.sql` (+ meta), `packages/db/src/queries/{patients.ts,appointments.ts}`,
`packages/db/src/index.ts`, `packages/shared/src/lib/appointments/status.ts` (+ tests, parity test),
integration tests `packages/db/src/patients.integration.test.ts` and updates to
`packages/db/src/appointments.integration.test.ts` / `practitioners.integration.test.ts`.

- [ ] Schema per the spec's Data section. `appointmentStatus` gains `no_show`; new `appointmentSource` enum.
- [ ] 0050: DDL, then the link trigger function `appointments_link_patient()` (BEFORE INSERT, not SECURITY DEFINER,
  `SET search_path = pg_catalog, public`), then the backfill (patients from existing appointments, newest name per
  phone; link all rows), then the CHECK `appointments_patient_link_check` added after the backfill.
- [ ] 0051: grants + RLS for patients (spec "Rules held by the database"); extra column grant on appointments;
  `CREATE OR REPLACE FUNCTION appointments_guard_customer_transition()` keeping every existing guard from 0045 and
  adding: booked -> no_show (started only; no_show_at set, done/cancel columns untouched); no_show_at may only change
  on that transition; the merge and erase shapes; any other change to patient_id/patient_name/phone/email/
  patient_note refused. Explain each in comments like 0042/0045 do.
- [ ] shared `status.ts`: statuses `booked | cancelled | done | no_show`; labels Booked / Cancelled / Attended /
  No-show; actions `cancel | done | no_show`; transitions no_show from booked. Mirror in db `APPOINTMENT_TRANSITIONS`
  (the `no_show` edge also requires `starts_at <= now`, stamps `no_show_at`). Parity test updated.
- [ ] `queries/appointments.ts`: `AppointmentRow` gains `patientId: string | null`, `source`, `noShowAt`; `phone`
  becomes `string | null`. `listAppointmentsForDates` and `findAppointment` show the linked patient's current name
  (left join patients; fall back to the snapshot). `NewAppointment` gains optional `patientId` (must be an existing
  patient of this business: bookSlot re-reads it inside the lock and uses its phone and name) and `source`, and
  `bookSlot` takes an options arg `{ ignorePause?: boolean }` (module must still be on). Remove `saveClinicNote`
  and its export and tests. `countAppointments` (admin) keeps working with the new status.
- [ ] `queries/patients.ts` (tenant-scoped unless noted):
  - `listPatients(tx, { filter: "all"|"upcoming"|"new"|"lapsed", search: string, now, today, limit })` ->
    `{ total, rows: PatientListRow[] }` with visits (done count), noShows, lastVisitDate, nextStartsAt/nextLocalDate/
    nextLocalStart. `new` = created this calendar month (business-local `today`'s month); `lapsed` = last visit more
    than 6 months before today and nothing upcoming. Search: name ILIKE (escape % and _), or digits contained in
    phone/alt_phone when the query has 3+ digits. Order: next visit soonest first for upcoming, else name.
  - `countPatients(tx)`.
  - `findPatient(tx, id)`, `findPatientByPhone(tx, e164)` (phone or alt_phone).
  - `listPatientAppointments(tx, patientId)`: newest first.
  - `updatePatient(tx, id, { name, altPhone, tags }, now)`: returns `"updated" | "not_found" | "phone_in_use"`
    (alt phone equal to another patient's phone or alt phone, checked under the `'appointments:' || business`
    advisory lock that bookSlot uses, so a booking cannot race it).
  - `mergePatients(tx, keepId, removeId, now)`: under the same lock; re-points appointments, copies the removed
    phone into keep.alt_phone when that is empty, merges tags (dedupe, cap 5), deletes the removed patient. Returns
    `"merged" | "not_found" | "same"`.
  - `erasePatient(tx, id, now)`: under the lock; `"has_upcoming"` when a booked appointment starts after now; else
    anonymises every linked appointment (spec) and deletes the patient; `"erased" | "not_found" | "has_upcoming"`.
- [ ] Integration tests (see existing `appointments.integration.test.ts` harness): linking on insert (new, existing
  by phone, by alt phone, concurrent same phone -> one patient), backfill shape via the migrated test DB,
  RLS isolation between two businesses and with the module off, every guard (no_show before start refused; merge
  keeping fields; erase refused on upcoming booked; arbitrary phone edit refused; patient INSERT refused for
  fynix_app), and each query's outcomes.

## Task 2: Shared parsers

**Files:** `packages/shared/src/lib/patients/{patient-form.ts,patient-form.test.ts,limits.ts}`.

- [ ] Pure parsers returning `FormParseResult` (see `lib/form-result`): `parsePatientEdit(formData)` (patientId
  uuid, name 1..80 via `cleanLine`, alt phone via `parsePhoneEntry` with the country field name used by
  `PhoneField` elsewhere, tags from a comma-separated input: trimmed, deduped case-insensitively, each 1..24, max 5),
  `parsePatientSearch(raw)` (trim, cap 80), `parseMergeLookup` (phone entry), `parseManualBooking` (date, start
  "HH:MM", doctor "any"|uuid, service id or "", patientId or name+phone). Unit tests for each refusal and message.

## Task 3: Appointments dashboard changes

**Files:** `apps/platform/app/app-host/(protected)/appointments/{actions.ts,commands.ts,errors.ts,page.tsx,*.test.ts}`,
`apps/platform/components/panel/appointments/{booking-details-panel.tsx,appointments-grid.tsx,appointments-list.tsx,appointments-day-columns.tsx}`,
`apps/platform/lib/appointments/booking-actions.ts`, admin `apps/admin/lib/appointment-counts.ts` if affected.

- [ ] Remove the Private note (NoteForm, saveClinicNoteAction, parseSaveNoteCommand, tests, CLINIC_NOTE usage).
- [ ] Transition parser accepts `no_show`; action re-checks "started" for both done and no_show (existing
  notStartedState). Panel: buttons **Attended** and **No-show** once started; status label from shared labels.
- [ ] Grid/list/day columns: a no_show booking renders like done but labelled No-show (accessible label too); an
  erased booking ("Deleted patient", phone null) renders without a tel link.
- [ ] Panel: patient name links to `/patients/<patientId>` when linked; "Added by the clinic" when source = clinic.
- [ ] "Add booking" link beside Settings (Task 5 builds the page).

## Task 4: Patients section

**Files:** `apps/platform/app/app-host/(protected)/patients/{page.tsx,[patientId]/page.tsx,actions.ts,commands.ts,errors.ts,*.test.ts}`,
`apps/platform/components/panel/patients/*`, `apps/platform/components/panel/customer-shell.tsx`,
`apps/platform/lib/server/business-modules.ts` (reuse `requireAppointmentsModule`).

- [ ] Nav: "Patients" (UsersIcon) right after Appointments, only when the module is on.
- [ ] List page per spec (search is a GET form; filter links like the appointments view links).
- [ ] Profile page per spec, with forms: edit, merge (lookup step via `?merge=<phone digits>` or a two-step form
  whose second step posts the found id), delete (confirm step, then redirect to `/patients?deleted=1` with a status
  line). Actions follow `appointments/actions.ts`: `paidCustomerOrNull`, parse, `withTenantScope`, module check,
  outcome -> state, `revalidatePath`. Pure command/outcome mapping unit tested like `commands.test.ts`.
- [ ] Phone display via `displayPhoneText` (server) like the appointments page.

## Task 5: Add booking

**Files:** `apps/platform/app/app-host/(protected)/appointments/new/{page.tsx,actions.ts}`,
`apps/platform/lib/server/clinic-booking.ts` (+ test), `apps/platform/lib/server/db.ts` (document the new
sanctioned getStaffDb exception).

- [ ] `loadClinicDay(businessId, date, doctor, now)` on the staff connection: readBookingContext + readSiteFacts +
  loadClinicCalendars for that day; builds the week with `minNoticeMinutes: 0`, `horizonDays: 180` and returns the
  day's free slots (and, per slot, free doctors). Refuses when the module is off.
- [ ] Page: day picker (date input + Previous/Next day), doctor chips when 2+ doctors, free slots as buttons (links
  setting `slot=HH:MM`), then the patient + service form. `?patient=<id>` (Book again) reads that patient through the
  tenant scope first (so a foreign id is simply not found) and prefills name + phone read-only.
- [ ] Action: parse (Task 2), re-resolve the slot server-side with `resolveRequestedSlot` semantics (fresh
  calendars, notice 0, horizon 180), then `bookSlot(getStaffDb(), session businessId, { ..., source: "clinic",
  patientId }, { ignorePause: true })`; SlotTakenError -> "That slot was just taken"; success redirects to
  `/appointments?view=today&day=<date>&booking=<id>`.

## Task 5b: Reports

**Files:** `packages/db/src/queries/patient-reports.ts` (+ integration test), `apps/platform/lib/patients/report-range.ts`
(+ test), `apps/platform/app/app-host/(protected)/patients/reports/page.tsx`, `apps/platform/components/panel/patients/report-*.tsx`.

- [ ] One tenant-scoped query module computing, for a local-date range: new patients (created in range), returning
  patients, visits, no-shows, cancellations, per-month new/visits for the 12 months ending at the range end, weekday
  and hour counts of non-cancelled bookings, per-practitioner bookings/attended/no-shows, online vs clinic counts.
  Aggregate in SQL (group by), not in JS over all rows.
- [ ] Pure range parsing (`?range=month|quarter|year`, default month) from the business-local today.
- [ ] Page per spec "Reports": big numbers, inline SVG bar charts (accessible: `role="img"` + aria-label summary and a
  visually hidden table), hairlines, no boxes. Link from the Patients page.

## Task 6: Verify end to end

- [ ] All checks green (see House rules). Integration tests on `fynix_platform_branch`.
- [ ] Browser e2e against app-pat.localhost:3051 with a script-minted session: backfilled patients visible; search;
  filters; profile history; edit tags/second phone; Add booking for a walk-in (new patient created); Book again;
  Attended / No-show on a started booking; merge two records; delete refused with an upcoming booking, then allowed;
  erased bookings show "Deleted patient" in Appointments; module off hides Patients; Reports numbers match the
  seeded data for each range. Screenshots in the scratchpad.
