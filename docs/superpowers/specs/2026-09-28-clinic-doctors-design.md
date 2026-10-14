# Clinic doctors: several calendars in one clinic

Date: 2026-09-28. Builds on `2026-09-25-business-modules-appointments-design.md` and the slot-booking plan
(`docs/superpowers/plans/2026-09-25-slot-booking.md`).

## Goal

A clinic with several doctors can list them, give each one a weekly schedule and leave days, and see bookings per
doctor. A patient on the clinic's website can book with **any doctor** (the default) or pick **a specific doctor**
and see only that doctor's free times. A clinic with one doctor looks and works exactly as it does today.

## Decisions (from the 2026-09-28 conversation)

- Reception or the owner manages doctors from the customer dashboard. Doctors do not log in (maybe later).
- One slot length for the whole clinic. It stays in `appointment_settings`.
- The booking pop-up asks for name, phone and service only (email and note were removed on 2026-09-28).

## Out of scope

- Doctor logins and per-doctor access.
- A slot length per doctor, and a different fee per doctor.
- Services that only some doctors offer. Every doctor offers every service in v1.
- Hospitals and departments. Reviews and ratings.
- Pricing: whether this is part of the paid Appointments add-on is decided separately.

## Data model

Migration `0044` adds three tables and one column. Migration `0045` adds grants and row-level security in the same
pattern as `0042` (customers see only their own business's rows; `fynix_staff` reads all).

**`practitioners`**: one row per doctor.

| column | notes |
|---|---|
| `id` uuid pk | |
| `business_id` uuid | FK `businesses` |
| `name` text | 1–80 characters, e.g. "Dr Meera Iyer" |
| `title` text null | 1–80 characters, e.g. "Sports physiotherapist" |
| `photo_media_id` uuid null | FK `media_assets`; new `media_asset_purpose` value `practitioner` |
| `uses_clinic_hours` boolean | default true: the doctor's schedule is the clinic's opening hours |
| `position` int | display order |
| `archived_at` timestamptz null | archived doctors keep their past bookings but take no new ones |
| `created_at` timestamptz | |

A business can have at most 20 active (not archived) doctors, enforced in the server action.

**`practitioner_hours`**: the doctor's own weekly schedule, used only when `uses_clinic_hours` is false. Same
columns and rules as `business_hours` (`day_of_week`, `opens_at`, `closes_at`, `closed`, `open_all_day`; split
shifts allowed).

**`practitioner_leave`**: `practitioner_id`, `starts_on`, `ends_on`, `note` null. Same shape and limits as
`business_closures`.

**`appointments.practitioner_id`** uuid, NOT NULL after backfill, with a composite FK
`(business_id, practitioner_id)` so a booking can't point at another business's doctor. The unique backstop index
changes from `(business_id, starts_at)` to `(practitioner_id, starts_at)` where status is not cancelled: two
doctors can now be booked at the same time.

**Backfill.** For every business that has an `appointment_settings` row, `0044` creates one practitioner named after
the business, with `uses_clinic_hours = true`, and points all of that business's appointments at it. The clinic
renames it to the real doctor later. So every appointments business always has at least one doctor, and there is
no separate "no doctors" code path.

## Availability rules

- A doctor's working ranges on a date are their weekly hours (the clinic's hours when `uses_clinic_hours`), minus
  **clinic closures** (a holiday closes every doctor), minus **that doctor's leave**.
- Slots sit on one grid for the whole clinic: they start at multiples of the slot length from midnight. A doctor
  whose shift starts at 09:15 with 30-minute slots gets a first slot at 09:30. This keeps the "any doctor" grid
  from showing overlapping times like 09:00–09:30 and 09:15–09:45. This also changes single-doctor clinics whose
  hours start off the grid (today their slots start at the opening time). A clinic opening at 09:00 or 14:00 with
  15-, 20-, 30- or 60-minute slots sees no change.
- A doctor is **free** for a slot when the slot sits inside their working ranges, meets the minimum notice and
  booking window, and doesn't overlap any of that doctor's non-cancelled bookings.
- **Specific doctor:** the slot is free when that doctor is free.
- **Any doctor:** the slot is free when at least one active doctor is free.
- The website never shows who else booked, or how many doctors are free.

`packages/shared/src/lib/appointments/slots.ts` stays pure. `buildWeekAvailability` gains a `practitioners` input
(each with its own hours, leave and busy list) and returns the same `SiteAvailability` shape. A new
`freePractitionersAt(date, start)` helper returns the free doctor ids for one slot, for the booking step.

## Booking

- The site contract gains an optional `practitionerId` (additive; null or missing means any doctor) on
  `SiteBookingFields`, and the availability endpoint accepts `?practitioner=<id>`.
- The OTP step re-checks the slot as today, now for the chosen doctor or for any doctor.
- `bookSlot` assigns the doctor inside its existing advisory lock:
  - Specific doctor: book them, or answer "taken" if they are no longer free.
  - Any doctor: from the doctors free at that slot, pick the one with the fewest bookings that day, then the
    lowest `position`. Answer "taken" only when none is free.
- The confirmation says who the booking is with: "You're booked with Dr Meera Iyer: Tuesday 29 September,
  09:30 – 10:00."

## Website (client site)

- `GET /api/site/info` gains `practitioners: [{ id, name, title, photoUrl }]` (active doctors, in order).
  Additive.
- On `/book`, when there are **two or more** doctors, a row of doctor cards sits above the week grid: "Any doctor"
  (selected by default), then each doctor with photo (or initials), name and title. Choosing one reloads the grid
  for that doctor. With one doctor the row is not shown.
- The booking pop-up shows the chosen doctor under the slot heading. For "Any doctor" it says "With the first
  available doctor", and the confirmation names who was assigned.

## Customer dashboard (clinic)

- **Doctors** page at `/appointments/doctors`, linked from Appointments settings:
  - A list of doctors in order, with photo, name and title. Actions: add, edit, reorder, archive.
  - Add/edit: name, title (optional), photo (optional, the existing upload path), and schedule.
  - Schedule: "Same as clinic hours" (default) or "Own hours", which opens the same weekly editor used on Your
    details. Leave days use the same editor as clinic closures.
  - Archiving a doctor with upcoming bookings is refused with the count ("Dr Rahul has 4 upcoming bookings.
    Reassign or cancel them first."). The last active doctor can't be archived.
- **Appointments view:**
  - A doctor filter above the grid ("All doctors", then each doctor), shown only with two or more doctors.
  - With "All doctors", each booking card shows the doctor's initials. The Today view shows one column per doctor.
  - The booking details panel shows the doctor and offers **Reassign** to another doctor who is free at that
    same time.
- **Adding leave over existing bookings:** saving leave that covers booked slots still saves, then lists those
  bookings so reception can reassign or cancel them. Nothing is cancelled automatically.

## Staff console

The client page's Features section shows the number of active doctors next to Appointments. Staff don't edit
doctors.

## Errors and edge cases

- Two patients choose "Any doctor" for the same slot at the same moment: the lock serialises them; the second gets
  the next free doctor, or "taken" if none is left.
- A doctor is archived or put on leave between a patient's code request and confirmation: the confirmation
  re-checks and answers "taken", as it does today for a taken slot.
- Photo missing or rejected: show initials.
- Old client sites that don't send `practitionerId` book "any doctor", so they keep working unchanged.

## Testing

- **Unit** (`slots.test.ts`): per-doctor hours, clinic-hours doctors, leave, clinic closures closing everyone,
  grid alignment for off-grid shift starts, the any-doctor union, and the fewest-bookings-then-position choice.
- **Integration** (`appointments.integration.test.ts`): backfill creates one doctor per business; RLS on the new
  tables; two concurrent any-doctor bookings land on two different doctors; the per-doctor unique index; reassign.
- **Server/action tests:** doctor CRUD limits, archive refusal, contract validation of `practitionerId`.
- **End to end:** the screenshot walk-through from 2026-09-28, extended with two doctors: book a specific doctor,
  book "any doctor", then see both in the clinic's week view with the doctor filter.

## Build order

1. Migrations `0044`/`0045`, schema, queries, backfill.
2. Pure slot engine changes and tests.
3. Site API (info, availability, OTP, confirm) and contract copies.
4. Clinic dashboard: Doctors page, then the appointments filter, per-doctor Today columns and reassign.
5. Client site: doctor cards, pop-up wording, confirmation.
6. Staff console doctor count; end-to-end run with screenshots.
