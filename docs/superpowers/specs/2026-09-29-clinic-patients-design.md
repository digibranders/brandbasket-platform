# Clinic patients: a patient register (design)

Date: 2026-09-29. Status: approved by the user in chat ("start building it", option A).

## Goal

A clinic that has the Appointments module switched on gets a **Patients** section: one record per person, built
from its bookings, with their visit history. It is a register, not a medical record: **no diagnosis, prescription,
history or free-text visit notes anywhere**.

## Decisions (user, 2026-09-29, taking the recommended answer to each)

1. The per-booking "Private note" (appointments.clinic_note) is removed from the dashboard: no UI, no action. The
   column stays (additive-only schema); existing notes are no longer shown. Erasing a patient clears it.
2. **No-show** is a new booking outcome beside Done (shown as "Attended").
3. Reception can **add a booking by hand** (walk-ins, phone calls) without the patient's SMS code.
4. **Delete patient** removes the person's name and phone from the register and from every one of their bookings;
   the bookings stay as anonymous slots ("Deleted patient") so the calendar and counts still add up.

## Data

### `patients` (new)

| column | notes |
|---|---|
| id | uuid v7 |
| business_id | FK businesses; composite unique (business_id, id) for tenant-safe FKs |
| name | 1..80 chars |
| phone | E.164, unique per business |
| alt_phone | nullable E.164, differs from phone |
| tags | text[] default '{}', at most 5, each 1..24 chars (validated in app; cardinality in DB) |
| created_at, updated_at | |

Index (business_id, alt_phone) where alt_phone is not null.

### `appointments` (changed)

- `patient_id uuid` nullable, composite FK (business_id, patient_id) -> patients(business_id, id).
- `source appointment_source` enum ('online', 'clinic') default 'online'.
- `no_show_at timestamptz`.
- `phone` becomes nullable. CHECK `(patient_id is null) = (phone is null)`: only an erased booking has neither.
- `appointment_status` gains `no_show`.

### Linking (database trigger, BEFORE INSERT on appointments)

When a row is inserted with `patient_id` null and a phone, the trigger finds the business's patient whose phone or
alt_phone equals it, else inserts one (name = the booking's name; `ON CONFLICT (business_id, phone) DO NOTHING`
then re-select, so two concurrent first bookings from one number share one patient). Every insert path (site OTP
confirm, reception's Add booking, tests, scripts) is covered by the one rule. A known patient's name is never
overwritten by a later booking; the booking keeps what was typed as its own snapshot.

Backfill in the same migration: one patient per (business_id, phone) of existing appointments, named from the most
recent booking; every existing appointment linked.

## Rules held by the database (fynix_app)

- patients: SELECT, UPDATE (name, alt_phone, tags, updated_at), DELETE. No INSERT: patients are only ever created
  by a booking. RLS: own business and the appointments module on, like every appointments table.
- appointments: extra column grant UPDATE (patient_id, patient_name, phone, email, patient_note, no_show_at). The
  guard trigger allows exactly:
  - status `booked -> no_show`, only once the slot has started, stamping no_show_at and nothing else;
  - **merge**: patient_id from one patient to another, every patient field unchanged;
  - **erase**: patient_id, phone, email, patient_note, clinic_note to null and patient_name to 'Deleted patient',
    only on a row that is not an upcoming booked one;
  - everything it allowed before, except saving a clinic note (the dashboard no longer offers it; the grant stays
    only so erase can clear it).

## Dashboard

### Patients (nav, after Appointments, only while the module is on)

- Big number: total patients. Filters: All · Upcoming · New this month · Not seen in 6 months. Search by name or
  phone (digits match anywhere in the number). Hairline list, serial 1..N: name, phone, visits, last visit, next
  visit. Capped at 200 rows with a "showing the first 200" line.
- Visits = bookings marked Attended. Last visit = latest Attended date. Next = earliest upcoming booked.

### Patient profile (`/patients/[id]`)

- Name, phone (tel link), second phone, tags; first seen, visits, no-shows.
- Next appointment; History (every booking: date, time, service, doctor, outcome) linking to the booking in
  Appointments.
- Edit: name, second phone, tags (with a short "No medical details" hint).
- **Book again**: `/appointments/new?patient=<id>`.
- **Merge**: enter the other record's phone -> confirm (its name and bookings count) -> its bookings move here and
  it is removed. Its phone becomes this patient's second phone when this one has none.
- **Delete patient**: confirm step; refused while they have an upcoming booking ("Cancel it first").

### Appointments (changes)

- Booking panel: "Mark done" becomes **Attended**, plus **No-show** (both once the slot has started). Private note
  removed. Patient name links to their profile. A clinic-added booking shows "Added by the clinic".
- **Add booking** link beside Settings -> `/appointments/new`: pick day (default today) and doctor (Any, or one when
  there are several), then a free slot, then patient (name + phone, or the prefilled patient from Book again) and
  service. Ignores the clinic's minimum notice and pause switch (reception is booking deliberately); slots must still
  be free, within working hours, not in the past, and within 180 days. Written on the staff connection with the
  business id taken only from the session (a sanctioned exception, like checkout.ts), through bookSlot, so the same
  lock and overlap rules apply.

### Reports (`/patients/reports`, user asked 2026-09-29)

Clinic numbers only; no medical data. A "Reports" link on the Patients page. Range: This month · Last 3 months ·
This year (business-local calendar).

- Big numbers: new patients, returning patients (had an Attended visit before the range and booked in it), visits
  (Attended), no-show rate (no-shows / (attended + no-shows)), cancellations.
- Month bars (last 12 months, inline SVG, no chart library): new patients and visits per month.
- Busiest days (Mon..Sun) and busiest hours: non-cancelled bookings in the range.
- Per doctor (only with 2+ doctors): bookings, attended, no-shows.
- Online vs added by the clinic.

## Next phase, not built now: medical report files

The user wants patients' reports (lab results, X-rays, prescriptions as PDF/images) attached to a patient. Before
building: private object storage with signed short-lived URLs (none exists yet; the same gap blocks blog covers),
file type/size limits and virus scanning, an access log of who opened which file, a per-clinic data agreement
(HIPAA BAA for US clinics, DPDP consent wording for India), retention and deletion with the patient. Tracked as a
separate spec.

## Out of scope

Visit notes, medical fields, file uploads (see Next phase), patient logins, exports, SMS to patients, cross-clinic
records.
