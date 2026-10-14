# Slot booking (Calendly-style week grid + OTP) — Design and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Never commit. Work only in the
> worktrees named below. Branch databases only: `webfold_appt`, `webfold_appt_test`, `webfold_payload_appt`.

**Supersedes** the request flow (patient asks for a day plus morning, afternoon or evening; clinic confirms) from
`docs/superpowers/specs/2026-09-25-business-modules-appointments-design.md` and
`docs/superpowers/plans/2026-09-25-business-modules-appointments.md`.

These parts stay as built:
- the admin module switch and time zone
- "Your details" (hours, closures, announcement)
- `/api/site/info` (with a changed `booking` shape)
- booking services
- pause booking
- RLS and module gating
- no emails

## What the user asked for (2026-09-25)

- **The website shows a week grid.**
  - Top row: the weekdays with their dates, with previous-week and next-week buttons.
  - Left column: the time slots, written as ranges: **"09:00 – 09:30"**, then "09:30 – 10:00", and so on.
  - The clinic picks the slot length **in its own dashboard**.
- **Taken slots are coloured or marked and can't be clicked.** Free slots can be clicked.
- **Booking takes three steps.** The patient clicks a free slot and enters name and phone. An **OTP is sent by SMS**.
  Once the OTP is verified, the slot is **booked straight away**.
- **The clinic's dashboard records every booking** and shows it in the same week grid.
- **There is no SMS provider yet.** Build a provider interface plus a local outbox; the user will add a real provider
  later.

## Decisions (defaults stated to the user, not objected to)

- **One calendar per clinic, one patient per slot.**
- **Slot length** is 15, 20, 30, 45 or 60 minutes, set by the clinic. Default 30.
- **Where slots come from:** open ranges in `business_hours` (split shifts supported). A range that closes after
  midnight is cut at 24:00. "Open all day" means 00:00–24:00. Days covered by a `business_closures` range are closed. A
  weekday with no hours rows is closed.
- **Booking window:**
  - A slot can be booked only if it starts at least `min_notice_minutes` from now (default 60).
  - It must also start within `horizon_days` (default 28), counted in the business time zone.
- **OTP:**
  - 6 digits, valid for 10 minutes, at most 5 tries.
  - Stored only as an HMAC-SHA256 with `BOOKING_OTP_SECRET`.
  - The OTP record holds the pending booking, so the confirm step only needs `{otpId, code}`.
  - There is no slot hold: the slot is checked again when the booking is confirmed. If someone else got it first, the
    patient gets `taken`.
- **Double booking is impossible:**
  - `bookSlot` takes `pg_advisory_xact_lock(hashtextextended('appointments:'||business_id,0))`, checks for any
    overlapping appointment that isn't cancelled, then inserts.
  - A backstop partial unique index on `(business_id, starts_at) WHERE status <> 'cancelled'` catches anything that
    gets past the lock.
- **The website never learns who booked.** Availability only returns `free | taken | past`.
- **Phone numbers** are stored in E.164 form. A 10-digit number without a country code defaults to +91.
- **Dashboard nav count:** "Appointments · N", where N is unseen bookings. "New" is tracked per booking
  (`appointments.seen_at`, `countUnseenBookings`, `markAppointmentSeen`), not on a single "last visited" timestamp:
  `seen_at` starts null and is set, once and only forward, when that particular booking is opened in the details
  panel -- not just by viewing the grid page. There is no `last_seen_at` anywhere.
- **Times in the grid** use 24-hour `HH:MM – HH:MM`.

## Contracts (ADDITIVE ONLY once shipped; the client site keeps byte-identical copies)

`apps/platform/lib/site-info.ts`: replace `SiteInfoBooking` with:
```ts
export interface SiteInfoBooking {
  readonly accepting: boolean;
  readonly pausedMessage: string | null;
  readonly services: readonly SiteInfoService[];
  /** Length of every slot in minutes. */
  readonly slotMinutes: number;
}
```
`lastBookableDate` is removed. The site grid gets its limits from availability instead. Nothing is deployed yet, so
changing this now is safe.

New file `apps/platform/lib/site-bookings.ts` (the client site keeps an identical copy at `lib/site-bookings.ts`):
```ts
/**
 * Week availability and the two-step OTP booking a client site's server calls. A copy of the platform's
 * apps/platform/lib/site-bookings.ts. ADDITIVE CHANGES ONLY.
 */
export type SiteSlotState = "free" | "taken" | "past";
export interface SiteSlot {
  readonly start: string; // "HH:MM", business local time
  readonly end: string;   // "HH:MM"
  readonly state: SiteSlotState;
}
export interface SiteAvailabilityDay {
  readonly date: string; // YYYY-MM-DD
  /** True on a closure, a weekday with no hours, or a day outside the booking window. */
  readonly closed: boolean;
  /** The closure's note when a closure caused it, else null. */
  readonly closedNote: string | null;
  readonly slots: readonly SiteSlot[]; // empty when closed
}
export interface SiteAvailability {
  readonly weekStart: string; // the Monday, YYYY-MM-DD
  readonly today: string;
  readonly slotMinutes: number;
  /** Monday of the previous week, or null when that week is entirely in the past. */
  readonly previousWeek: string | null;
  /** Monday of the next week, or null when it starts after the booking window. */
  readonly nextWeek: string | null;
  readonly days: readonly SiteAvailabilityDay[]; // always 7, Monday first
}
export interface SiteBookingFields {
  readonly name: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly serviceId?: string | null;
  readonly date: string;  // YYYY-MM-DD
  readonly start: string; // HH:MM
  readonly note?: string | null;
  /** Honeypot: left empty by people. */
  readonly website?: string | null;
}
export interface SiteOtpRequest {
  readonly fields: SiteBookingFields;
  readonly clientIp: string;
}
export interface SiteOtpConfirm {
  readonly otpId: string;
  readonly code: string;
  readonly clientIp: string;
}
export type SiteBookingErrorCode =
  | "invalid" | "taken" | "paused" | "unavailable" | "limited" | "failed"
  | "wrong_code" | "expired" | "too_many_attempts";
export type SiteBookingError = {
  readonly status: "error";
  readonly code: SiteBookingErrorCode;
  readonly message: string;
  readonly field: string | null;
};
export type SiteOtpResponse =
  | { readonly status: "otp_sent"; readonly otpId: string; readonly expiresInSeconds: number; readonly phoneHint: string }
  | SiteBookingError;
export type SiteConfirmResponse =
  | { readonly status: "booked"; readonly date: string; readonly start: string; readonly end: string }
  | SiteBookingError;
```

## Endpoints (platform)

All endpoints use the bearer site token (`findTenantBySiteToken`), send `Cache-Control: no-store`, include no patient
data in any response or log, and allow no CORS on POST.

- **`GET /api/site/availability?week=YYYY-MM-DD`**
  - `week` is any date in the week; it defaults to the current week.
  - 200 returns `SiteAvailability`.
  - 403 `{status:"error",code:"unavailable"}` when the module is off or there are no settings or no time zone.
  - 409 `paused` returns the paused message.
  - 400 for a bad week.
  - Days before today keep their normal slots, all marked `past`, so the grid shape stays stable. Days after the booking window, and days whose hours give no slots, are closed.
  - CORS GET is allowed.
- **`POST /api/site/bookings/otp`** (body `SiteOtpRequest`)
  - Checks, in order: auth, then JSON/size (16 KB), then shape, then honeypot. A filled honeypot returns a fake 200
    `otp_sent` with a random id; nothing is stored or sent.
  - Then the field parse, which returns 422 `invalid` with the field.
  - Then the OTP secret and SMS provider are resolved. In production, `SMS_PROVIDER` resolving to the local outbox
    (unset, or explicitly `outbox`) is refused as `SmsProviderUnavailableError`: 403 `unavailable`, logged as a
    config error with no patient data. Outside production this stays lenient -- the outbox is fine in dev and test.
  - Then module and paused: 403 or 409.
  - Then the service check (422 on `serviceId`).
  - Then the slot must exist in that day's generated slots and be `free` (`resolveRequestedSlot`, shared with the
    confirm step's own re-validation below). A taken slot gets 409 `taken`. A slot that is past, outside the window
    or misaligned gets 422 `invalid` on `start`.
  - Then the phone's country must be in `SMS_ALLOWED_COUNTRY_CODES` (default 91) -- the anti SMS-pumping guard.
    Otherwise 422 `invalid` on `phone`.
  - Then rate limits, narrowest first, which return 429. Each rule has its own key -- in particular the two
    per-business phone rules never share a key with each other, since `consumeRateLimit` deletes a key's older
    windows on every call and a shared key would let the shorter window silently wipe the longer one's counter:
    - `otp:ip:<biz>:<ipKey>`: 10 per hour
    - `otp:phone:10m:<biz>:<e164>`: 3 per 10 minutes
    - `otp:phone:day:<biz>:<e164>`: 8 per day
    - `otp:phone:any:<e164>`: 10 per day, across every business (no `<biz>` in the key) -- the backstop against the
      same number spread across many businesses' per-business budgets
    - `otp:business:<biz>`: 300 per day
  - Then create the OTP, send the SMS, and return 200 `otp_sent` with `phoneHint` (the last 4 digits, e.g.
    `"•••• 3210"`). If sending fails, delete the OTP row and return 500 `failed`, so the patient can retry.
  - Fires `purgeExpiredBookingData` opportunistically at the start of the request (see Database below) -- not
    awaited, and any failure is only logged; it never delays or fails the OTP request itself.
- **`POST /api/site/bookings/confirm`** (body `SiteOtpConfirm`)
  - Rate limit `otp-confirm:ip:<ipKey>`: 30 per hour.
  - Load the OTP, scoped to the site token's own business (an OTP created under one business's token can never be
    confirmed through another's). Not found, already used, or past `expires_at`: 410 `expired`.
  - `attempts >= 5`: 429 `too_many_attempts`.
  - `claimOtpAttempt` claims an attempt atomically (claim-then-compare, not compare-then-increment, so two requests
    racing the same OTP can never both check a code they weren't entitled to) before the code is compared. On a
    mismatch: 422 `wrong_code` with "That code isn't right. N tries left." ("1 try left" when singular). On the
    last try, 429 `too_many_attempts` with "No tries left. Send a new code." instead.
  - On a match: the slot's own start time is checked (409 `taken`, "That time has passed. Please pick another
    slot." if it's already begun), then the slot is re-validated against the business's *current* hours, closures
    and booking window using the same `resolveRequestedSlot` the OTP step used, for the payload's own date/start
    -- hours can be shortened, a closure added, or the window shrunk in the minutes since the OTP was sent, and
    `bookSlot`'s own re-check (below) does not catch that. Not still free: 409 `taken`, "That time is no longer
    available. Please pick another slot." (Skipped when the module itself is off or never fully set up; `bookSlot`'s
    `BookingClosedError` path already answers that case correctly.)
  - Then mark it verified, then `bookSlot(db, businessId, ...)`, which re-checks the module/accepting state and the
    overlap atomically inside its own advisory lock:
    - `SlotTakenError` returns 409 `taken`: "Someone just booked that slot. Please pick another."
    - `BookingClosedError` (module off, or paused in the meantime) is disambiguated by re-reading the current
      state: 403 `unavailable` or 409 `paused`.
    - Success deletes the now-redundant OTP row (best-effort; a cleanup failure is only logged, never turns a
      successful booking into a failed response) and returns 200 `booked`.

## SMS

- **`apps/platform/lib/server/sms/`:** `SmsSender { send(message: { to: string; body: string; businessId: string }): Promise<void> }`.
- **`createSmsSender()`** reads the `SMS_PROVIDER` env var:
  - `outbox` is the default: it inserts into `sms_messages`. Refused with `SmsProviderUnavailableError` when
    `NODE_ENV === "production"` (see the OTP endpoint above) -- the local outbox never sends a real SMS, so it must
    never be what a real deployment quietly falls back to.
  - Anything else throws a clear configuration error listing the supported values.
- **Message text:** `"<code> is your code to book with <Business name>. It expires in 10 minutes. Do not share it."`
  - Keep it in a single template function, because India's DLT rules need fixed templates.
- **Admin outbox page:** also lists `sms_messages` (newest 50: to, body, time). This is the only place the code is
  visible locally.
- **`.env.example`:** document `SMS_PROVIDER` and `BOOKING_OTP_SECRET` (at least 32 characters). In `.env.local`,
  generate a random `BOOKING_OTP_SECRET` and set `SMS_PROVIDER=outbox`.

## Database (rewrite 0041/0042 in place; the branch is unshared)

After the rewrite, rebuild `webfold_appt` and `webfold_appt_test` from the pristine `webfold` and `webfold_test`, then
migrate. Aster Physio's test data is recreated by the e2e step.

- **`appointment_settings`:**
  - Keep `accepting` and `paused_message`.
  - Add `slot_minutes int not null default 30 check (slot_minutes in (15,20,30,45,60))`.
  - Add `min_notice_minutes int not null default 60 check (between 0 and 10080)`.
  - Add `horizon_days int not null default 28 check (between 1 and 180)`.
  - Keep `updated_at`. No `last_seen_at` -- "new" is tracked per booking (`appointments.seen_at` below), not here.
  - The app role's UPDATE grant covers exactly `accepting`, `paused_message`, `slot_minutes`, `min_notice_minutes`,
    `horizon_days` and `updated_at` -- the business id and every other column stay out of it.
- **`appointment_services`:** unchanged.
- **`appointments`:** replaces `appointment_requests`. Columns:
  - `id` (uuidv7), `business_id`
  - `service_id` + `service_name` (the composite FK to services is kept)
  - `patient_name` 1–80
  - `phone`, with check `phone ~ '^\+[0-9]{8,15}$'`
  - `email` null or 3–254
  - `patient_note` null or 1–300
  - `local_date date`, `local_start time`, `local_end time`
  - `starts_at timestamptz`, `ends_at timestamptz`, with an `ends_at > starts_at` check and a max-duration check
    (`ends_at <= starts_at + interval '1 day'`) -- the latter is what lets `bookSlot`'s overlap check and
    `listBusyIntervals` both add a cheap `starts_at >=` filter and still use the `(business_id, starts_at)` index,
    without ever excluding a real overlap.
  - `status`: enum `appointment_status` with values `booked | cancelled | done`, default `booked`
  - `cancel_reason` null or 1–200
  - `clinic_note` null or 1–500
  - `cancelled_at`, `done_at`, `created_at`, `handled_by_user_id`
  - `seen_at timestamptz null`: "new" is tracked here, per booking, not on `appointment_settings`. Starts null;
    `markAppointmentSeen` sets it, once, when the dashboard opens that particular booking.

  Indexes:
  - `(business_id, local_date)`
  - `(business_id, created_at)`
  - partial unique index `(business_id, starts_at) where status <> 'cancelled'`

  Drop `appointment_window` and the old statuses.
- **`booking_otps`:**
  - Columns: `id` (uuidv7), `business_id`, `phone` (E.164), `code_hash text` (a salted HMAC-SHA256, keyed with the
    row's own id -- see `hashOtpCode`; the code itself is never stored), `payload jsonb not null` (the parsed
    booking fields plus `serviceName`, `end`, `startsAt`, `endsAt`), `attempts int default 0`,
    `expires_at timestamptz`, `verified_at timestamptz null`, `created_at`.
  - Index `(business_id, phone, created_at)`. Every read/write is scoped by `business_id` (an OTP created under one
    business's site token can never be looked up, let alone confirmed, through another's).
  - Staff only: no app or public grants, RLS enabled, staff allow-all.
  - Deleted once its slot is booked (`confirmBookingOtp`, best-effort) and, failing that, by the purge below.
- **`sms_messages`:** `id`, `business_id` null, `to_phone`, `body`, `transport text default 'outbox'`, `created_at`.
  Staff only (SELECT, INSERT, and DELETE for the purge below).
- **Patient data retention -- `purgeExpiredBookingData(db, now)`:** deletes `booking_otps` rows expired more than an
  hour ago (a short grace window, in case something still needs to read a just-expired one) and `sms_messages` rows
  older than 7 days. Called opportunistically from `requestBookingOtp` (see Endpoints above) rather than on a
  schedule -- this app has no cron/worker process today, so running it, best-effort, on traffic that already
  touches this table is the simpler of the two options considered (the other being a dedicated `pnpm` script on a
  schedule) and needs no extra infrastructure.
- **Grants and RLS:** follow the existing 0042 pattern. `app_module_enabled` stays as it is, not SECURITY DEFINER.
  - The app role on `appointments`: SELECT, plus UPDATE on (`status`, `cancel_reason`, `clinic_note`, `cancelled_at`,
    `done_at`, `handled_by_user_id`, `seen_at`).
  - The app role on `appointment_settings`: UPDATE on (`accepting`, `paused_message`, `slot_minutes`,
    `min_notice_minutes`, `horizon_days`, `updated_at`). No `last_seen_at` grant -- that column doesn't exist.
- **Trigger `appointments_guard_customer_transition`** (for `webfold_app`):
  - It allows only these status changes: `booked→cancelled` and `booked→done`.
  - `booked→done` is additionally refused when the slot hasn't started yet (`OLD.starts_at > now()`) -- the same
    rule `transitionAppointment`'s own WHERE clause already holds application-side (`starts_at <= now`, added only
    to the "done" edge), held again here so it can never be bypassed by a direct UPDATE outside that one query path.
  - When the status is unchanged, only `clinic_note`, `handled_by_user_id` and `seen_at` may change.
  - `handled_by_user_id` may only stay the same or become `public.app_current_user_id()`.
  - `seen_at` may only move forward: once set, `webfold_app` may not clear it back to null or move it to a
    different timestamp, so a booking already marked seen can never look unseen again.
  - Column guards on the transitioning update itself: marking an appointment `done` may not also set
    `cancel_reason` or `cancelled_at` in the same statement; cancelling may not also set `done_at`.
  - `search_path = pg_catalog`.

## Queries (`packages/db`; must not import shared)

- **`business-modules`:** unchanged. Seeding still creates settings with the defaults.
- **`appointments.ts`** (rewrite). The customer functions take a scoped `tx`:
  - `findAppointmentSettings`
  - `updateAppointmentSettings(tx, patch, now)`
  - service CRUD, unchanged
  - `listAppointmentsForDates(tx, fromDate, toDate)`: includes cancelled; ordered by `local_date`, `local_start`, `id`
  - `findAppointment`
  - `transitionAppointment(tx, id, {action:"cancel", reason} | {action:"done"}, userId, now)`: returns the row, or
    null. The `done` edge's own WHERE clause additionally requires `starts_at <= now` (see the trigger above for
    the database-side backstop of the same rule).
  - `saveClinicNote`
  - `countUnseenBookings(tx)`: bookings whose `seen_at` is still null
  - `markAppointmentSeen(tx, id, now)`: sets one booking's `seen_at`, once, when the dashboard opens it

  The staff functions take `db`:
  - `readBookingContext`: adds `slotMinutes`, `minNoticeMinutes`, `horizonDays`
  - `listBusyIntervals(db, businessId, fromUtc, toUtc)`: returns `{startsAt, endsAt}` where status isn't cancelled
  - `createBookingOtp`
  - `findBookingOtp`
  - `claimOtpAttempt`: claim-then-compare, not compare-then-increment -- atomically checks `attempts < maxAttempts`
    (plus not verified, not expired) and increments in the same UPDATE, so two requests racing the same OTP can
    never both read "one try left" and both check a code they weren't entitled to
  - `markOtpVerified`: conditional on `verified_at is null`; returns a boolean
  - `deleteBookingOtp`: called once a booked OTP's slot is booked, and by `purgeExpiredBookingData` for anything
    left over
  - `purgeExpiredBookingData(db, now)`: deletes expired `booking_otps` (past `expires_at` by more than an hour) and
    old `sms_messages` (older than 7 days) -- see Database above
  - `bookSlot(db, businessId, NewAppointment)`: advisory lock, re-checks module/accepting (throws
    `BookingClosedError` if either is off), overlap check, insert. Throws the exported `SlotTakenError` on overlap.
  - `insertSmsMessage`
  - `listSmsMessages(db, limit)`
  - `countAppointments(db, businessId)`: returns `{upcoming, total}`
- **`APPOINTMENT_TRANSITIONS`** becomes `{cancel:[{from:[booked],to:cancelled}], done:[{from:[booked],to:done}]}`, and
  the shared parity test is updated to match.

## Shared (pure)

- **`calendar/local-date.ts`:** add three functions.
  - `mondayOf(date)`
  - `zonedTimeToUtc(date, "HH:MM", timeZone): Date`. It converts a local wall time to UTC through Intl offset
    iteration, and must be correct across DST, e.g. America/New_York on DST days. A non-existent local time moves
    forward.
  - `minutesOfDay("HH:MM")`, with `formatMinutes(n)` as its inverse.
- **`appointments/slots.ts`:**
  - `SLOT_MINUTE_OPTIONS = [15,20,30,45,60]`
  - `buildWeekAvailability(input): SiteAvailability-shaped plain object`, where `input` is:
    - `{ weekStart, today, nowMinutes, hours, closures, slotMinutes, minNoticeMinutes, horizonDays }`
    - `busy: { date, start, end }[]` (in local time)
  - Rules:
    - Slots are generated from each open range, aligned to the start of the range. A last slot that would overrun
      the range is dropped.
    - Slots on today before `now + minNotice` are `past`.
    - Days after `today + horizonDays - 1` are closed.
    - A slot overlapping any busy interval is `taken`.
  - `previousWeek` and `nextWeek` follow the contract.
  - `slotLabel(start, end)` returns `"09:00 – 09:30"`.
  - Also `findSlot(...)`, which the OTP step uses to validate a requested slot.
- **`appointments/booking-form.ts`:** replaces `request-form`.
  - `parseBookingFields(fields)` returns `{name, phone (E.164), email, serviceId, date, start, note}` or a field error.
  - `normalisePhone(raw, defaultCountryCode = "91")`
  - `isBookingHoneypotFilled`
  - `phoneHint(e164)`
- **Deletions:**
  - Remove `request-form.ts`, `APPOINTMENT_WINDOWS`, window labels, the old statuses and the old groups.
  - Keep `booking-date.ts` only if it's still used; otherwise delete it.
  - Update `limits.ts` (cancel reason 200, clinic note 500).
- **`appointments/otp.ts`:** `OTP_LENGTH = 6`, `OTP_TTL_SECONDS = 600`, `OTP_MAX_ATTEMPTS = 5`, `isOtpCode(value)`
  (used by the platform's own `siteOtpConfirmSchema` for the `code` field, not just by the client site's input).
  Generating and hashing happen on the platform server, not in shared.

## Clinic dashboard (`apps/platform`)

- **`/appointments?view=today|week|month|custom`:** (`view-params.ts`) rather than a single `?week=`.
  - `today` and `week` are grid views (the week grid, same shape as the site's). `month` and `custom` are list views
    (`appointments-list.tsx`), each row numbered with a continuous serial number (the "Sr no" column, and the
    aria-label's "Booking N of total" prefix) rather than grouped silently by date.
  - `custom` takes `from`/`to` and is capped at `MAX_CUSTOM_RANGE_DAYS = 366` days.
  - Past dates are allowed in every view (unlike the site, which only ever shows the current and future weeks).
  - **Free cell (grid views):** empty and light.
  - **Booked cell/row:** the patient's first name and the service; `prefetch={false}` on its link (a booking is
    opened rarely enough, and there are enough of them on a busy week, that prefetching every one wastes more than
    it saves).
  - **Done:** muted with a tick.
  - **Cancelled:** hidden from the grid/list and listed separately as "Cancelled this week" (or the view's own
    equivalent).
  - Clicking a booking opens `?<view params>&booking=<id>`, a details panel with:
    - name, `tel:` phone and `mailto:` email
    - service and note
    - "Booked <relative time>"
    - actions: Cancel (behind its own confirm step -- "Cancel booking" first, then "Cancel this booking? The slot
      opens up again." with "Yes, cancel"/back), Mark done (only once the slot has started -- enforced at the DB
      trigger too, not just by the button being hidden), and a private note
  - **Big number:** "N new" -- unseen bookings (`countUnseenBookings`), not "since the clinic's last visit". Opening
    a booking's own details panel calls `markAppointmentSeen` for that booking specifically.
  - **Mobile:** the grid scrolls sideways inside its own container. The page itself never scrolls sideways.
  - **Hours:** slots follow the clinic's current hours and slot length. Bookings made under an older slot length
    still show, in the row whose start time matches, or at their own start.
- **`/appointments/settings`:**
  - Slot length (select), minimum notice (select: none, 1 h, 2 h, 4 h, 1 day), and booking window (1, 2, 4, 8
    weeks).
  - Online booking pause and its message.
  - Services, unchanged.
  - A link to "Your details" for hours and closures.
- **Nav:** `Appointments · N` uses `countUnseenBookings`. `AppointmentsNavRefresh` stays.
- **`commands.ts`** (the view/booking-panel server actions) is kept, not removed -- only the old request inbox and
  request `row-actions` go. Reuse the panel-form helpers.

## Admin

- The Features counts show "N upcoming · M total".
- The outbox page adds an "SMS" section with the latest 50 `sms_messages`.

## Client site (`firstfold-test-client-site-appt`)

- Keep a byte-identical copy of `lib/site-bookings.ts` and the updated `lib/site-info.ts`.
- Server routes. Each forwards to the platform with the token and `no-store`, and relays only contract-shaped bodies.
  Anything else becomes 502 `failed`.
  - `GET /api/availability?week=`
  - `POST /api/book/otp`: body limit, JSON and same-origin checks as the current `/api/book`; adds `clientIp`.
  - `POST /api/book/confirm`
  - Remove the old `/api/book`.
- **`/book` page:**
  - The week grid, in a client component: header row of days as "Mon 28". No separate time-label column -- every
    cell is its own button/card carrying its own time range ("09:00 – 09:30"), so free/taken/past are told apart by
    style alone (background, hatch, greying), never by a status word competing with the time for space; the
    aria-label is what actually names the state for assistive tech.
  - Free cells are buttons (`aria-label="Book Monday 28 September, 09:00 – 09:30"`).
  - Taken cells are disabled and hatch-patterned only (no strike-through) -- `aria-label` ends "..., taken".
  - Past cells are greyed out (`aria-label` ends "..., past") -- also disabled, same as taken.
  - The legend reads **Free / Taken / Past** (a bare swatch, a hatch swatch, a muted swatch), matching those
    aria-labels exactly -- not "Unavailable" for the past state.
  - `.week-nav` (prev/today/next plus the loading indicator) wraps and drops its min-widths under ~400px so it
    still fits at a 375px viewport without forcing the page to scroll sideways.
  - Closed days show "Closed" (with the note).
  - Previous and next buttons follow the API.
- **Clicking a free slot opens the booking panel in a modal `<dialog>`** (`showModal()`, docked to the bottom edge
  and full-width under ~640px rather than floating centred) with:
  - the chosen slot label
  - name, phone (placeholder "+91 98765 43210"), optional email, service (when there are any) and optional note
  - the honeypot field
  - a "Send code" button

  Then the OTP step shows "We sent a 6-digit code to •••• 3210", a code input (inputMode numeric, autocomplete
  one-time-code), and "Book", "Resend code" and "Change details" buttons.
- **After booking:** "You're booked: Monday 28 September, 09:00 – 09:30." A `taken` error at either step shows a
  message, closes the panel and refreshes the grid. A 500 from the confirm step is relayed as-is (its own safe,
  validated body), same as the OTP-send route already did -- not collapsed into a generic 502.
- **When booking is off or paused,** the page shows "Call us to book." or the paused message, as it does today.
- Keep the accessibility work: a live region, focus handling and `aria-invalid`.

## Tasks (sequence)

1. **Shared pure logic:** slots, time zones, booking form, phone, OTP constants, parity test. No I/O.
2. **DB:** schema and migration rewrite, queries and integration tests, including a concurrent double-booking test, an
   OTP attempts test and a trigger test. Then rebuild the branch databases.
3. **Platform site API and SMS:** availability, OTP, confirm, the outbox sender, env settings and tests.
4. **Clinic dashboard:** week grid, details, settings and nav.
5. **Admin:** counts and the SMS outbox.
6. **Client site:** routes, grid, booking panel and OTP step.
7. **Local end to end:** book a slot from the site and read the OTP from the admin outbox. Confirm the slot shows as
   taken, try a double booking, a wrong code 5 times and an expired code, and check the booking appears in the clinic
   grid. Cancel it and the slot is free again. Change the slot length. Then run the full check suite.

Tasks 1, 2 and 6 can run in parallel, because they touch different packages and use the contracts above. Task 3 needs
1 and 2. Tasks 4 and 5 need 2 and 1.
