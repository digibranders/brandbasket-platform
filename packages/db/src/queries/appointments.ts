import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  appointments,
  appointmentServices,
  appointmentSettings,
  bookingOtps,
  businesses,
  businessModules,
  patients,
  practitioners,
  smsMessages,
  type AppointmentSource,
  type AppointmentStatus,
} from "../schema";
import { activePractitionerIdsAmong } from "./practitioners";
import { currentBusinessId, hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

/** The `appointments_max_duration_check` bound (ends_at <= starts_at + 1 day): any appointment that could overlap
 * a window starting at X cannot start earlier than X minus this, so both bookSlot's overlap check and
 * listBusyIntervals add it as a `starts_at >=` filter -- it never excludes a real overlap, and it lets both queries
 * use the (business_id, starts_at) index instead of scanning every appointment the business has ever had. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Customer-scoped queries here run inside withTenantScope, same as onboarding-data.ts and business-facts.ts; row-
 * level security also requires the appointments module to be switched on for every table but business_modules
 * itself, so a scoped call against a business with the module off sees nothing (reads come back empty, writes
 * affect zero rows) rather than an error.
 *
 * The system (staff-connection) queries at the bottom -- readBookingContext, listBusyIntervals, the booking_otps
 * functions, bookSlot, insertSmsMessage/listSmsMessages, countAppointments -- are what the platform's /api/site/*
 * routes and the SMS sender use: they have no per-visitor tenant scope, since a booking page visitor is not signed
 * in to anything, and bookSlot in particular must run its overlap check and insert as one atomic unit rather than
 * inside a caller-supplied tenant transaction.
 */

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

export interface AppointmentSettingsRow {
  readonly accepting: boolean;
  readonly pausedMessage: string | null;
  readonly slotMinutes: number;
  readonly minNoticeMinutes: number;
  readonly horizonDays: number;
}

const SETTINGS_COLUMNS = {
  accepting: appointmentSettings.accepting,
  pausedMessage: appointmentSettings.pausedMessage,
  slotMinutes: appointmentSettings.slotMinutes,
  minNoticeMinutes: appointmentSettings.minNoticeMinutes,
  horizonDays: appointmentSettings.horizonDays,
} as const;

export async function findAppointmentSettings(tx: ScopedTransaction): Promise<AppointmentSettingsRow | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx.select(SETTINGS_COLUMNS).from(appointmentSettings).where(eq(appointmentSettings.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/** True when a settings row existed to update (it always does once the module is on and its row was seeded; false
 * only means the module has never been switched on for this tenant, or is currently off). `slotMinutes`,
 * `minNoticeMinutes` and `horizonDays` are only shape-checked here (they are numbers); the DB's check constraints
 * are the source of truth for their allowed ranges and throw a CHECK_VIOLATION when violated. */
export async function updateAppointmentSettings(
  tx: ScopedTransaction,
  input: Partial<{
    readonly accepting: boolean;
    readonly pausedMessage: string | null;
    readonly slotMinutes: number;
    readonly minNoticeMinutes: number;
    readonly horizonDays: number;
  }>,
  now: Date,
): Promise<boolean> {
  const businessId = await currentBusinessId(tx);
  const set: Partial<typeof appointmentSettings.$inferInsert> = { updatedAt: now };
  if (input.accepting !== undefined) set.accepting = input.accepting;
  if (input.pausedMessage !== undefined) {
    set.pausedMessage = input.pausedMessage === null || input.pausedMessage.trim() === "" ? null : input.pausedMessage;
  }
  if (input.slotMinutes !== undefined) set.slotMinutes = input.slotMinutes;
  if (input.minNoticeMinutes !== undefined) set.minNoticeMinutes = input.minNoticeMinutes;
  if (input.horizonDays !== undefined) set.horizonDays = input.horizonDays;
  const rows = await tx
    .update(appointmentSettings)
    .set(set)
    .where(eq(appointmentSettings.businessId, businessId))
    .returning({ businessId: appointmentSettings.businessId });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------------------------------------------

export interface AppointmentServiceRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly archivedAt: Date | null;
}

const SERVICE_COLUMNS = {
  id: appointmentServices.id,
  name: appointmentServices.name,
  position: appointmentServices.position,
  archivedAt: appointmentServices.archivedAt,
} as const;

export async function listAppointmentServices(
  tx: ScopedTransaction,
  opts: { readonly includeArchived: boolean },
): Promise<AppointmentServiceRow[]> {
  const businessId = await currentBusinessId(tx);
  const where = opts.includeArchived
    ? eq(appointmentServices.businessId, businessId)
    : and(eq(appointmentServices.businessId, businessId), isNull(appointmentServices.archivedAt));
  return tx.select(SERVICE_COLUMNS).from(appointmentServices).where(where).orderBy(asc(appointmentServices.position), asc(appointmentServices.id));
}

/** Appended at the end of the list: one past the current highest position, or 0 when there are none yet. */
export async function addAppointmentService(tx: ScopedTransaction, name: string): Promise<AppointmentServiceRow> {
  const businessId = await currentBusinessId(tx);
  const maxRows = await tx
    .select({ max: sql<number | null>`max(${appointmentServices.position})` })
    .from(appointmentServices)
    .where(eq(appointmentServices.businessId, businessId));
  const nextPosition = (maxRows[0]?.max ?? -1) + 1;
  const rows = await tx.insert(appointmentServices).values({ businessId, name, position: nextPosition }).returning(SERVICE_COLUMNS);
  const service = rows[0];
  if (service === undefined) throw new Error("Appointment service insert returned no row");
  return service;
}

export async function renameAppointmentService(tx: ScopedTransaction, serviceId: string, name: string): Promise<boolean> {
  if (!isUuid(serviceId)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(appointmentServices)
    .set({ name })
    .where(and(eq(appointmentServices.id, serviceId), eq(appointmentServices.businessId, businessId)))
    .returning({ id: appointmentServices.id });
  return rows.length > 0;
}

export async function setAppointmentServiceArchived(
  tx: ScopedTransaction,
  serviceId: string,
  archived: boolean,
  now: Date,
): Promise<boolean> {
  if (!isUuid(serviceId)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(appointmentServices)
    .set({ archivedAt: archived ? now : null })
    .where(and(eq(appointmentServices.id, serviceId), eq(appointmentServices.businessId, businessId)))
    .returning({ id: appointmentServices.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Appointments: reads
// ---------------------------------------------------------------------------------------------------------------

export interface AppointmentRow {
  readonly id: string;
  /** The doctor this booking is with: always one of this business's practitioners (composite foreign key), possibly
   * one archived since. */
  readonly practitionerId: string;
  /** The register entry this booking belongs to (see patients.ts). Null only once the patient has been erased, and
   * then `phone` is null too and `patientName` is "Deleted patient". */
  readonly patientId: string | null;
  /** listAppointmentsForDates and findAppointment return the linked patient's current name, so a rename in the
   * register shows on every booking; the rows the write functions return carry the booking's own snapshot (what was
   * typed when it was made), which is the same thing until the clinic renames the patient. */
  readonly patientName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
  readonly patientNote: string | null;
  readonly localDate: string;
  /** Normalised to "HH:MM" (Postgres returns a `time` as "HH:MM:SS"; the seconds are dropped here since no
   * caller books to the second). */
  readonly localStart: string;
  readonly localEnd: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: AppointmentStatus;
  readonly cancelReason: string | null;
  readonly clinicNote: string | null;
  readonly cancelledAt: Date | null;
  readonly doneAt: Date | null;
  readonly noShowAt: Date | null;
  /** `clinic` for a booking reception added by hand, `online` for one made on the client site. */
  readonly source: AppointmentSource;
  readonly createdAt: Date;
  readonly handledByUserId: string | null;
  /** "New" tracked per booking, like unread: null until markAppointmentSeen has stamped it. Once set it can only
   * stay the same -- see the guard trigger in 0042. */
  readonly seenAt: Date | null;
}

const APPOINTMENT_COLUMNS = {
  id: appointments.id,
  practitionerId: appointments.practitionerId,
  patientId: appointments.patientId,
  patientName: appointments.patientName,
  phone: appointments.phone,
  email: appointments.email,
  serviceId: appointments.serviceId,
  serviceName: appointments.serviceName,
  patientNote: appointments.patientNote,
  localDate: appointments.localDate,
  localStart: appointments.localStart,
  localEnd: appointments.localEnd,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  status: appointments.status,
  cancelReason: appointments.cancelReason,
  clinicNote: appointments.clinicNote,
  cancelledAt: appointments.cancelledAt,
  doneAt: appointments.doneAt,
  noShowAt: appointments.noShowAt,
  source: appointments.source,
  createdAt: appointments.createdAt,
  handledByUserId: appointments.handledByUserId,
  seenAt: appointments.seenAt,
} as const;

/** APPOINTMENT_COLUMNS for the two dashboard reads, which left-join the booking's patient: its current name when it
 * has one, else the booking's own snapshot (an erased booking's "Deleted patient"). */
const APPOINTMENT_READ_COLUMNS = {
  ...APPOINTMENT_COLUMNS,
  patientName: sql<string>`coalesce(${patients.name}, ${appointments.patientName})`,
} as const;

/** The join APPOINTMENT_READ_COLUMNS reads the patient's name through. On business_id as well as id, the same pair
 * the composite foreign key ties together, so it can never pick up another business's patient. */
const PATIENT_OF_APPOINTMENT = and(eq(patients.businessId, appointments.businessId), eq(patients.id, appointments.patientId));

/** Postgres returns `time` columns as "HH:MM:SS"; every appointment row is normalised through this to "HH:MM"
 * before it leaves this module (see the doc comment on AppointmentRow.localStart). */
function normaliseAppointmentRow(row: AppointmentRow): AppointmentRow {
  return { ...row, localStart: row.localStart.slice(0, 5), localEnd: row.localEnd.slice(0, 5) };
}

/** The clinic dashboard's week grid: every appointment (cancelled included, so a cancelled slot can still be
 * listed under the grid) whose local_date falls in [fromDate, toDate], both "YYYY-MM-DD" and inclusive. Ordered so
 * the grid can walk the result in display order without re-sorting. */
export async function listAppointmentsForDates(tx: ScopedTransaction, fromDate: string, toDate: string): Promise<AppointmentRow[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(APPOINTMENT_READ_COLUMNS)
    .from(appointments)
    .leftJoin(patients, PATIENT_OF_APPOINTMENT)
    .where(and(eq(appointments.businessId, businessId), gte(appointments.localDate, fromDate), lte(appointments.localDate, toDate)))
    .orderBy(asc(appointments.localDate), asc(appointments.localStart), asc(appointments.id));
  return rows.map(normaliseAppointmentRow);
}

export async function findAppointment(tx: ScopedTransaction, id: string): Promise<AppointmentRow | null> {
  if (!isUuid(id)) return null;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(APPOINTMENT_READ_COLUMNS)
    .from(appointments)
    .leftJoin(patients, PATIENT_OF_APPOINTMENT)
    .where(and(eq(appointments.id, id), eq(appointments.businessId, businessId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : normaliseAppointmentRow(row);
}

/** Every booking linked to `patientId`, newest first: the patient profile's history. The caller (patients.ts's
 * listPatientAppointments, the public entry point) has already checked the id is a UUID. */
export async function listAppointmentsForPatient(tx: ScopedTransaction, patientId: string): Promise<AppointmentRow[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(APPOINTMENT_READ_COLUMNS)
    .from(appointments)
    .leftJoin(patients, PATIENT_OF_APPOINTMENT)
    .where(and(eq(appointments.businessId, businessId), eq(appointments.patientId, patientId)))
    .orderBy(desc(appointments.startsAt), desc(appointments.id));
  return rows.map(normaliseAppointmentRow);
}

/** Booked appointments the clinic dashboard has never shown, like an unread count -- "new" is tracked per booking
 * (seen_at), not with one settings-level last-visit timestamp, so a booking made while the dashboard was mid-page
 * still counts once it lands. This is the "Appointments" nav count. */
export async function countUnseenBookings(tx: ScopedTransaction): Promise<number> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), eq(appointments.status, "booked"), isNull(appointments.seenAt)));
  return rows[0]?.count ?? 0;
}

/** Stamps `seen_at` the first time the dashboard shows this booking, and only the first time: the WHERE clause
 * (and the guard trigger in 0042, in case anything ever calls this outside the query builder) both hold seen_at to
 * a one-way null -> value move, so a booking already marked seen can never be marked seen "again" with a later
 * timestamp. Returns whether this call was the one that set it. */
export async function markAppointmentSeen(tx: ScopedTransaction, id: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(appointments)
    .set({ seenAt: now })
    .where(and(eq(appointments.id, id), eq(appointments.businessId, businessId), isNull(appointments.seenAt)))
    .returning({ id: appointments.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Appointments: transitions
// ---------------------------------------------------------------------------------------------------------------

export type AppointmentAction = "cancel" | "done" | "no_show";

export type AppointmentTransition =
  | { readonly action: "cancel"; readonly reason: string | null }
  | { readonly action: "done" }
  | { readonly action: "no_show" };

interface TransitionEdge {
  readonly from: readonly AppointmentStatus[];
  readonly to: AppointmentStatus;
}

/**
 * Must match ACTION_TRANSITIONS in packages/shared/src/lib/appointments/status.ts; packages/db does not depend on
 * @firstfold/shared (the dependency points the other way), so the data is written literally here and
 * status-db-parity.test.ts in packages/shared asserts the two agree.
 */
export const APPOINTMENT_TRANSITIONS: Readonly<Record<AppointmentAction, readonly TransitionEdge[]>> = {
  cancel: [{ from: ["booked"], to: "cancelled" }],
  done: [{ from: ["booked"], to: "done" }],
  no_show: [{ from: ["booked"], to: "no_show" }],
};

/** The outcomes that record what happened at the slot, so only make sense once it has started. */
function needsStartedSlot(action: AppointmentAction): boolean {
  return action === "done" || action === "no_show";
}

/** The one `*_at` column each target status stamps. */
function timestampField(to: AppointmentStatus, now: Date): Partial<typeof appointments.$inferInsert> {
  switch (to) {
    case "cancelled":
      return { cancelledAt: now };
    case "done":
      return { doneAt: now };
    case "no_show":
      return { noShowAt: now };
    default:
      return {};
  }
}

/**
 * Moves `id` along the one edge of `transition.action` whose `from` list contains its current status, guarded by
 * APPOINTMENT_TRANSITIONS: one conditional UPDATE per allowed edge, tried in order, each scoped to
 * `WHERE id = id AND business_id = currentBusinessId AND status = ANY(edge.from)`. Returns the first row an edge
 * actually updated. Null when the appointment was not in an allowed status for this action (someone else already
 * moved it, or it never could be), is not this business's, or `id` is not a UUID.
 *
 * The `done` and `no_show` edges additionally require `starts_at <= now`: whether the patient came is only known
 * once the slot has started (the dashboard only offers either action from then on, but this holds the rule even
 * against a direct call), so `now` is load-bearing for those actions and not just a timestamp to stamp. The guard
 * trigger (0051) is the database-side backstop for both.
 *
 * `userId` is stamped onto handled_by_user_id on every edge: any team member may work any of their business's
 * appointments, so this always records who most recently touched it rather than who "owns" it.
 */
export async function transitionAppointment(
  tx: ScopedTransaction,
  id: string,
  transition: AppointmentTransition,
  userId: string,
  now: Date,
): Promise<AppointmentRow | null> {
  if (!isUuid(id)) return null;

  const cancelReason =
    transition.action === "cancel"
      ? transition.reason === null || transition.reason.trim() === ""
        ? null
        : transition.reason
      : undefined;

  const businessId = await currentBusinessId(tx);
  const edges = APPOINTMENT_TRANSITIONS[transition.action];

  for (const edge of edges) {
    const set: Partial<typeof appointments.$inferInsert> = {
      status: edge.to,
      handledByUserId: userId,
      ...timestampField(edge.to, now),
    };
    if (transition.action === "cancel") set.cancelReason = cancelReason;

    const conditions = [eq(appointments.id, id), eq(appointments.businessId, businessId), inArray(appointments.status, edge.from)];
    if (needsStartedSlot(transition.action)) conditions.push(lte(appointments.startsAt, now));

    const rows = await tx
      .update(appointments)
      .set(set)
      .where(and(...conditions))
      .returning(APPOINTMENT_COLUMNS);
    const updated = rows[0];
    if (updated !== undefined) return normaliseAppointmentRow(updated);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// System (staff connection): what the platform's /api/site/* routes and the SMS sender need
// ---------------------------------------------------------------------------------------------------------------

export interface BookingContext {
  readonly enabled: boolean;
  readonly timeZone: string | null;
  readonly settings: AppointmentSettingsRow | null;
  /** Unarchived only: an archived service can no longer be booked. */
  readonly services: readonly AppointmentServiceRow[];
}

export async function readBookingContext(db: Database, businessId: string): Promise<BookingContext> {
  const [enabledRows, businessRows, settingsRows, serviceRows] = await Promise.all([
    db
      .select({ enabled: businessModules.enabled })
      .from(businessModules)
      .where(and(eq(businessModules.businessId, businessId), eq(businessModules.module, "appointments")))
      .limit(1),
    db.select({ timeZone: businesses.timeZone }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    db.select(SETTINGS_COLUMNS).from(appointmentSettings).where(eq(appointmentSettings.businessId, businessId)).limit(1),
    db
      .select(SERVICE_COLUMNS)
      .from(appointmentServices)
      .where(and(eq(appointmentServices.businessId, businessId), isNull(appointmentServices.archivedAt)))
      .orderBy(asc(appointmentServices.position), asc(appointmentServices.id)),
  ]);
  return {
    enabled: enabledRows[0]?.enabled ?? false,
    timeZone: businessRows[0]?.timeZone ?? null,
    settings: settingsRows[0] ?? null,
    services: serviceRows,
  };
}

export interface BusyInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Whose calendar the interval blocks: a booking with one doctor leaves every other doctor free at that time. */
  readonly practitionerId: string;
}

/** Every non-cancelled appointment overlapping [fromUtc, toUtc), for buildWeekAvailability's `busy` input, each
 * tagged with its practitioner so the caller can work out availability per doctor. */
export async function listBusyIntervals(db: Database, businessId: string, fromUtc: Date, toUtc: Date): Promise<BusyInterval[]> {
  const earliestPossibleOverlap = new Date(fromUtc.getTime() - ONE_DAY_MS);
  return db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, practitionerId: appointments.practitionerId })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        ne(appointments.status, "cancelled"),
        gte(appointments.startsAt, earliestPossibleOverlap),
        lt(appointments.startsAt, toUtc),
        gt(appointments.endsAt, fromUtc),
      ),
    )
    .orderBy(asc(appointments.startsAt));
}

// ---------------------------------------------------------------------------------------------------------------
// Booking OTPs
// ---------------------------------------------------------------------------------------------------------------

/** The parsed booking the OTP will turn into an appointment once verified -- SiteBookingFields
 * (packages/shared/src/lib/appointments/booking-form.ts) plus the fields resolved server-side. packages/db does
 * not depend on @firstfold/shared, so this shape is written literally here rather than imported; it is opaque
 * jsonb to Postgres and only ever read back by the platform route that wrote it. */
export interface BookingOtpPayload {
  readonly name: string;
  readonly phone: string;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** The doctor the patient picked, or null for any doctor. Optional because an OTP written before a clinic could
   * have more than one doctor, and still pending across the deploy, has no such key: read it as null. */
  readonly practitionerId?: string | null;
  /** The patient notice version the page showed, kept to record once the booking is made. Absent from an OTP held before
   * it existed, or from a client site that does not send it yet. */
  readonly noticeVersion?: string;
}

export interface NewBookingOtp {
  /** Supplied by the caller when it must know the row's id before the insert -- the platform's booking OTP flow
   * salts codeHash's HMAC with this id, so it generates one (uuidv7-shaped) up front and passes it here rather
   * than letting the column's own `$defaultFn` assign one after the hash would already need it. Omitted, the
   * column default applies as usual. */
  readonly id?: string;
  readonly businessId: string;
  readonly phone: string;
  readonly codeHash: string;
  readonly payload: BookingOtpPayload;
  readonly expiresAt: Date;
}

export interface BookingOtpRow {
  readonly id: string;
  readonly businessId: string;
  readonly phone: string;
  readonly codeHash: string;
  readonly payload: BookingOtpPayload;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

const BOOKING_OTP_COLUMNS = {
  id: bookingOtps.id,
  businessId: bookingOtps.businessId,
  phone: bookingOtps.phone,
  codeHash: bookingOtps.codeHash,
  payload: bookingOtps.payload,
  attempts: bookingOtps.attempts,
  expiresAt: bookingOtps.expiresAt,
  verifiedAt: bookingOtps.verifiedAt,
  createdAt: bookingOtps.createdAt,
} as const;

export async function createBookingOtp(db: Database, input: NewBookingOtp): Promise<string> {
  const rows = await db
    .insert(bookingOtps)
    .values({
      ...(input.id === undefined ? {} : { id: input.id }),
      businessId: input.businessId,
      phone: input.phone,
      codeHash: input.codeHash,
      payload: input.payload,
      expiresAt: input.expiresAt,
    })
    .returning({ id: bookingOtps.id });
  const row = rows[0];
  if (row === undefined) throw new Error("Booking OTP insert returned no row");
  return row.id;
}

export interface FindBookingOtpInput {
  readonly otpId: string;
  readonly businessId: string;
}

/** Scoped to `businessId`, so an OTP created through one business's site token can never be looked up -- let alone
 * confirmed -- through another business's. Keeps returning attempts/expires_at/verified_at alongside the payload
 * so the caller can tell an expired OTP from an exhausted one when it builds the error response. */
export async function findBookingOtp(db: Database, input: FindBookingOtpInput): Promise<BookingOtpRow | null> {
  if (!isUuid(input.otpId)) return null;
  const rows = await db
    .select(BOOKING_OTP_COLUMNS)
    .from(bookingOtps)
    .where(and(eq(bookingOtps.id, input.otpId), eq(bookingOtps.businessId, input.businessId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row, payload: row.payload as BookingOtpPayload };
}

export interface ClaimOtpAttemptInput {
  readonly otpId: string;
  readonly businessId: string;
  readonly maxAttempts: number;
  readonly now: Date;
}

/**
 * Atomically claims one of the OTP's `maxAttempts` tries and returns the new count, or null when there was no try
 * left to claim -- the OTP does not exist, belongs to another business, is already verified, has expired, or is
 * already at `maxAttempts`. The claim ("attempts < maxAttempts, then increment") and every other condition are all
 * in the one UPDATE's WHERE clause, so two requests racing to confirm the same OTP can never both read "4 attempts
 * so far, one left" and both increment past the limit -- only one claims the last slot, and the loser gets null
 * instead of comparing a code it was never entitled to check.
 *
 * Callers claim first and compare the submitted code against the OTP's hash only after a successful claim --
 * comparing before claiming is exactly the read-compare-then-increment race this closes.
 */
export async function claimOtpAttempt(db: Database, input: ClaimOtpAttemptInput): Promise<{ readonly attempts: number } | null> {
  if (!isUuid(input.otpId)) return null;
  const rows = await db
    .update(bookingOtps)
    .set({ attempts: sql`${bookingOtps.attempts} + 1` })
    .where(
      and(
        eq(bookingOtps.id, input.otpId),
        eq(bookingOtps.businessId, input.businessId),
        lt(bookingOtps.attempts, input.maxAttempts),
        isNull(bookingOtps.verifiedAt),
        gt(bookingOtps.expiresAt, input.now),
      ),
    )
    .returning({ attempts: bookingOtps.attempts });
  return rows[0] ?? null;
}

export interface MarkOtpVerifiedInput {
  readonly otpId: string;
  readonly businessId: string;
  readonly maxAttempts: number;
  readonly now: Date;
}

/** Conditional on `verified_at is null`, `expires_at > now`, `attempts <= maxAttempts` and the business id, so a
 * second call (double submit, a stale retry after expiry, or one that raced past the attempt limit) returns false
 * rather than re-verifying. */
export async function markOtpVerified(db: Database, input: MarkOtpVerifiedInput): Promise<boolean> {
  if (!isUuid(input.otpId)) return false;
  const rows = await db
    .update(bookingOtps)
    .set({ verifiedAt: input.now })
    .where(
      and(
        eq(bookingOtps.id, input.otpId),
        eq(bookingOtps.businessId, input.businessId),
        isNull(bookingOtps.verifiedAt),
        gt(bookingOtps.expiresAt, input.now),
        lte(bookingOtps.attempts, input.maxAttempts),
      ),
    )
    .returning({ id: bookingOtps.id });
  return rows.length > 0;
}

export async function deleteBookingOtp(db: Database, otpId: string): Promise<boolean> {
  if (!isUuid(otpId)) return false;
  const rows = await db.delete(bookingOtps).where(eq(bookingOtps.id, otpId)).returning({ id: bookingOtps.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Booking a slot
// ---------------------------------------------------------------------------------------------------------------

/** Thrown by bookSlot when the requested slot is no longer free with any of its candidate practitioners: each one
 * now has a booking overlapping it (caught by the advisory-lock overlap check), none was an active practitioner of
 * the business, or the partial unique index on (practitioner_id, starts_at) rejected the insert (the backstop for
 * anything that slips past the lock, e.g. a slot booked outside this code path). */
export class SlotTakenError extends Error {
  constructor() {
    super("That slot is already booked.");
    this.name = "SlotTakenError";
  }
}

/** Thrown by bookSlot when the person being booked already has a non-cancelled booking overlapping the new one, with
 * any doctor. A person is the phone number plus the name read without regard to case or spacing: one phone may
 * still book two different names at the same time (a parent with two children), but one patient cannot be in two
 * chairs at once, which is what a double tap, a second tab or a confused retry would otherwise create. */
export class PatientOverlapError extends Error {
  constructor() {
    super("That patient already has a booking at that time.");
    this.name = "PatientOverlapError";
  }
}

/** Thrown by bookSlot when, re-read inside the advisory lock, the appointments module is off or the business has
 * paused online booking. The platform's confirmBookingOtp does not pre-check this itself -- it calls bookSlot
 * directly and, on this error, re-reads the current state (describeBookingClosed) only to choose the response's
 * wording -- because only bookSlot itself can check it atomically with the insert: a module switch-off or a pause
 * that landed between the OTP being sent and this confirm must still be caught here, not missed by a check that
 * ran too early. */
export class BookingClosedError extends Error {
  constructor() {
    super("Online booking is currently closed.");
    this.name = "BookingClosedError";
  }
}

/** Thrown by bookSlot when `patientId` names no patient of the business, re-read inside the advisory lock: the id
 * is malformed, another business's, or the patient was merged away or erased after the caller read it. */
export class PatientNotFoundError extends Error {
  constructor() {
    super("That patient is no longer in the register.");
    this.name = "PatientNotFoundError";
  }
}

/** A new booking. It carries no email or patient note: the booking form stopped asking for them, so the
 * appointments.email and appointments.patient_note columns are only ever set on rows booked before that. */
export interface NewAppointment {
  /** Ignored when `patientId` is given: the patient's own name and phone, re-read under the lock, are used. */
  readonly patientName: string;
  readonly phone: string;
  /** Reception's "Book again": book this existing patient of the business. Omitted, the link trigger (0050) finds
   * or creates the patient from `phone`. */
  readonly patientId?: string;
  /** Defaults to the column's `online`; reception's Add booking passes `clinic`. */
  readonly source?: AppointmentSource;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
  readonly localDate: string;
  readonly localStart: string;
  readonly localEnd: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The doctors this booking may go to, in the clinic's display (position) order: those the caller has already
   * checked are working at this time (their hours, their leave, the clinic's closures) -- one id when the patient
   * picked a doctor, every such doctor when they chose "any". bookSlot only decides which of these is still free,
   * never whether one works then. */
  readonly practitionerIds: readonly string[];
}

export interface BookSlotOptions {
  /** Reception's Add booking books deliberately, so it may book while the clinic has paused online booking. The
   * module itself must still be on: switching it off closes every path. */
  readonly ignorePause?: boolean;
}

interface BookingPerson {
  /** Null lets the link trigger find or create the patient from `phone`. */
  readonly patientId: string | null;
  readonly patientName: string;
  readonly phone: string;
}

/** Who bookSlot books: the existing patient `input.patientId` names (their current name and phone), or the typed
 * name and phone. Must run inside bookSlot's advisory lock. */
async function bookingPerson(tx: ScopedTransaction, businessId: string, input: NewAppointment): Promise<BookingPerson> {
  if (input.patientId === undefined) return { patientId: null, patientName: input.patientName, phone: input.phone };
  if (!isUuid(input.patientId)) throw new PatientNotFoundError();
  const [patient] = await tx
    .select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.id, input.patientId), eq(patients.businessId, businessId)))
    .limit(1);
  if (patient === undefined) throw new PatientNotFoundError();
  return { patientId: patient.id, patientName: patient.name, phone: patient.phone };
}

/**
 * Whether `person` already has a non-cancelled booking at `businessId` that overlaps [startsAt, endsAt), with any
 * doctor. The question bookSlot asks under its lock before it inserts. A person is the phone number plus the name,
 * compared without regard to case or spacing (see PatientOverlapError). It is asked only once the patient has proved
 * their phone: asking it of an anonymous visitor would tell anyone with a name and a number whether that person has
 * a booking at a given time.
 */
export async function personHasBookingOverlapping(
  db: Database | ScopedTransaction,
  businessId: string,
  person: { readonly phone: string; readonly patientName: string },
  window: { readonly startsAt: Date; readonly endsAt: Date },
): Promise<boolean> {
  const earliestPossibleOverlap = new Date(window.startsAt.getTime() - ONE_DAY_MS);
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(appointments.phone, person.phone),
        sql`lower(regexp_replace(btrim(${appointments.patientName}), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(${person.patientName}), '[[:space:]]+', ' ', 'g'))`,
        ne(appointments.status, "cancelled"),
        gte(appointments.startsAt, earliestPossibleOverlap),
        lt(appointments.startsAt, window.endsAt),
        gt(appointments.endsAt, window.startsAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Books `input` as a new, `booked` appointment for `businessId` with the first of its candidate practitioners who
 * is still free, refusing the slot if none is. Runs as one transaction: it first takes
 * `pg_advisory_xact_lock(hashtextextended('appointments:' || businessId, 0))`, so two concurrent bookSlot calls for
 * the same business serialise against each other rather than both reading "free" before either inserts (see
 * replaceOpeningHours in business-facts.ts for the same pattern) -- this is what actually stops two different,
 * merely overlapping slots from both landing on one doctor, since the partial unique index below only ever sees
 * identical `starts_at` values. The lock is per business, not per practitioner, because one call weighs several
 * doctors at once and archivePractitioner/reassignAppointment take the same lock to change who can be booked.
 *
 * Once it holds the lock:
 *  1. It re-reads whether the module is on and the business is accepting bookings, throwing BookingClosedError
 *     without inserting if not (closing the race between the platform's own pre-check and this call). With
 *     `options.ignorePause` only the module is checked.
 *  2. With `input.patientId`, it re-reads that patient of `businessId` and books under their current name and
 *     phone, throwing PatientNotFoundError if there is none -- mergePatients and erasePatient take the same lock, so
 *     the patient cannot disappear between this read and the insert. Without it, the link trigger (0050) finds or
 *     creates the patient from `phone` as the row is inserted.
 *  3. It narrows `practitionerIds` to the business's active practitioners, re-read under the lock: an archived
 *     doctor, another business's, or a malformed id is skipped rather than left for the composite
 *     (business_id, practitioner_id) foreign key to throw on. No candidate left (including an empty list to begin
 *     with) is SlotTakenError: there is nobody to book the patient with.
 *  4. It orders the candidates by how many non-cancelled bookings each already has on `localDate`, fewest first, so
 *     "any doctor" spreads a day's patients across the clinic; the sort is stable, so ties keep the caller's
 *     (position) order and a clinic with equally busy doctors fills them in the order it lists them.
 *  5. It finds which candidates have a non-cancelled appointment overlapping [startsAt, endsAt) and inserts with the
 *     first that does not. All busy is SlotTakenError.
 *  6. It refuses, as PatientOverlapError, a person who already has a non-cancelled booking overlapping this one
 *     with any doctor (personHasBookingOverlapping).
 *
 * The partial unique index on (practitioner_id, starts_at) is a second, independent backstop -- a unique-violation
 * on it is also mapped to SlotTakenError, in case a row ever gets inserted outside this lock (a script, a future
 * code path).
 *
 * A `serviceId` naming another business's service violates the composite (business_id, service_id) foreign key
 * and throws, same as any other foreign-key violation.
 */
export async function bookSlot(
  db: Database,
  businessId: string,
  input: NewAppointment,
  options: BookSlotOptions = {},
): Promise<AppointmentRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('appointments:' || ${businessId}, 0))`);

    const [moduleRows, settingsRows] = await Promise.all([
      tx
        .select({ enabled: businessModules.enabled })
        .from(businessModules)
        .where(and(eq(businessModules.businessId, businessId), eq(businessModules.module, "appointments")))
        .limit(1),
      tx.select({ accepting: appointmentSettings.accepting }).from(appointmentSettings).where(eq(appointmentSettings.businessId, businessId)).limit(1),
    ]);
    const moduleEnabled = moduleRows[0]?.enabled ?? false;
    const accepting = settingsRows[0]?.accepting ?? false;
    if (!moduleEnabled || (!accepting && options.ignorePause !== true)) throw new BookingClosedError();

    const person = await bookingPerson(tx, businessId, input);

    if (input.practitionerIds.length === 0) throw new SlotTakenError();
    const active = await activePractitionerIdsAmong(tx, businessId, input.practitionerIds);
    const candidates = [...new Set(input.practitionerIds)].filter((id) => active.has(id));
    if (candidates.length === 0) throw new SlotTakenError();

    const earliestPossibleOverlap = new Date(input.startsAt.getTime() - ONE_DAY_MS);
    const [dayCounts, overlapping] = await Promise.all([
      tx
        .select({ practitionerId: appointments.practitionerId, count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, businessId),
            inArray(appointments.practitionerId, candidates),
            eq(appointments.localDate, input.localDate),
            ne(appointments.status, "cancelled"),
          ),
        )
        .groupBy(appointments.practitionerId),
      tx
        .selectDistinct({ practitionerId: appointments.practitionerId })
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, businessId),
            inArray(appointments.practitionerId, candidates),
            ne(appointments.status, "cancelled"),
            gte(appointments.startsAt, earliestPossibleOverlap),
            lt(appointments.startsAt, input.endsAt),
            gt(appointments.endsAt, input.startsAt),
          ),
        ),
    ]);
    const countFor = new Map(dayCounts.map((row) => [row.practitionerId, row.count]));
    const busy = new Set(overlapping.map((row) => row.practitionerId));
    // Array.prototype.sort is stable, so equal counts keep the caller's order.
    const practitionerId = [...candidates]
      .sort((left, right) => (countFor.get(left) ?? 0) - (countFor.get(right) ?? 0))
      .find((id) => !busy.has(id));
    if (practitionerId === undefined) throw new SlotTakenError();
    // After the doctor check, so a slot that is simply taken is still reported as taken. Under the same lock as the
    // insert, so two taps at once for one patient cannot both pass.
    if (await personHasBookingOverlapping(tx, businessId, person, { startsAt: input.startsAt, endsAt: input.endsAt })) {
      throw new PatientOverlapError();
    }

    try {
      const rows = await tx
        .insert(appointments)
        .values({
          businessId,
          practitionerId,
          serviceId: input.serviceId,
          serviceName: input.serviceName === null || input.serviceName.trim() === "" ? null : input.serviceName,
          patientId: person.patientId,
          patientName: person.patientName,
          phone: person.phone,
          ...(input.source === undefined ? {} : { source: input.source }),
          localDate: input.localDate,
          localStart: input.localStart,
          localEnd: input.localEnd,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "booked",
        })
        .returning(APPOINTMENT_COLUMNS);
      const booked = rows[0];
      if (booked === undefined) throw new Error("Appointment insert returned no row");
      return normaliseAppointmentRow(booked);
    } catch (error) {
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new SlotTakenError();
      throw error;
    }
  });
}

export type ReassignResult = "reassigned" | "taken" | "not_found";

/**
 * Customer-scoped: moves an upcoming booking to another of the clinic's doctors. Takes the same per-business
 * advisory lock as bookSlot, so a booking cannot land on the target doctor between the overlap check below and the
 * update (and the target cannot be archived meanwhile: archivePractitioner takes that lock too).
 *
 *  - `not_found` when `id` or `practitionerId` is not a UUID; the appointment is not this business's, not `booked`,
 *    or does not start after `now` (cancelled and done bookings are history, and a started one has already been
 *    seen by whoever it was with); or the target is not an active practitioner of this business, or is the doctor
 *    the booking is already with.
 *  - `taken` when the target already has a non-cancelled booking overlapping this one's [starts_at, ends_at), or
 *    the (practitioner_id, starts_at) unique index catches one that slipped past the lock.
 *  - `reassigned` otherwise.
 *
 * Whether the target actually *works* at that time (their hours, their leave) is the caller's check, made with the
 * pure slot engine before calling this, same division of labour as bookSlot's `practitionerIds`. The database
 * independently holds the rest: appointments_guard_customer_transition only lets firstfold_app change practitioner_id
 * on a row that is booked before and after, and the composite foreign key refuses another business's practitioner.
 */
export async function reassignAppointment(
  tx: ScopedTransaction,
  id: string,
  practitionerId: string,
  now: Date,
): Promise<ReassignResult> {
  if (!isUuid(id) || !isUuid(practitionerId)) return "not_found";
  const businessId = await currentBusinessId(tx);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('appointments:' || ${businessId}, 0))`);

  const [appointment] = await tx
    .select({ practitionerId: appointments.practitionerId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.id, id),
        eq(appointments.businessId, businessId),
        eq(appointments.status, "booked"),
        gt(appointments.startsAt, now),
      ),
    )
    .limit(1);
  if (appointment === undefined || appointment.practitionerId === practitionerId) return "not_found";

  const active = await activePractitionerIdsAmong(tx, businessId, [practitionerId]);
  if (!active.has(practitionerId)) return "not_found";

  const earliestPossibleOverlap = new Date(appointment.startsAt.getTime() - ONE_DAY_MS);
  const overlapping = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(appointments.practitionerId, practitionerId),
        ne(appointments.status, "cancelled"),
        gte(appointments.startsAt, earliestPossibleOverlap),
        lt(appointments.startsAt, appointment.endsAt),
        gt(appointments.endsAt, appointment.startsAt),
      ),
    )
    .limit(1);
  if (overlapping.length > 0) return "taken";

  try {
    // A savepoint, so a unique violation here rolls back only this update and leaves the caller's transaction usable.
    const rows = await tx.transaction((savepoint) =>
      savepoint
        .update(appointments)
        .set({ practitionerId })
        .where(and(eq(appointments.id, id), eq(appointments.businessId, businessId), eq(appointments.status, "booked")))
        .returning({ id: appointments.id }),
    );
    return rows.length > 0 ? "reassigned" : "not_found";
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return "taken";
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// SMS outbox
// ---------------------------------------------------------------------------------------------------------------

export interface NewSmsMessage {
  readonly businessId: string | null;
  readonly toPhone: string;
  readonly body: string;
  /** Defaults to "outbox" at the column level; only ever something else once a real provider exists. */
  readonly transport?: string;
}

export async function insertSmsMessage(db: Database, message: NewSmsMessage): Promise<void> {
  await db.insert(smsMessages).values({
    businessId: message.businessId,
    toPhone: message.toPhone,
    body: message.body,
    ...(message.transport === undefined ? {} : { transport: message.transport }),
  });
}

export interface SmsMessageRow {
  readonly id: string;
  readonly businessId: string | null;
  readonly toPhone: string;
  readonly body: string;
  readonly transport: string;
  readonly createdAt: Date;
}

const SMS_MESSAGE_COLUMNS = {
  id: smsMessages.id,
  businessId: smsMessages.businessId,
  toPhone: smsMessages.toPhone,
  body: smsMessages.body,
  transport: smsMessages.transport,
  createdAt: smsMessages.createdAt,
} as const;

/** Between 1 and 200 inclusive: a limit is a page size, not a way to ask for everything or for nothing. */
const MAX_SMS_LIST_LIMIT = 200;

function clampSmsLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SMS_LIST_LIMIT);
}

/** Newest first, for the admin outbox page. created_at is not unique across rows sent in the same instant, so
 * every row also carries the id as a tiebreaker -- without it, rows tied on created_at could come back in a
 * different relative order across calls (or across pages, once this gets pagination). */
export async function listSmsMessages(db: Database, limit: number): Promise<SmsMessageRow[]> {
  const safeLimit = clampSmsLimit(limit);
  return db
    .select(SMS_MESSAGE_COLUMNS)
    .from(smsMessages)
    .orderBy(desc(smsMessages.createdAt), desc(smsMessages.id))
    .limit(safeLimit);
}

// ---------------------------------------------------------------------------------------------------------------
// Patient data retention
// ---------------------------------------------------------------------------------------------------------------

/** An hour past expiry, not the moment of expiry itself: a short grace window in case anything (a support
 * question about a code that "didn't work") still needs to read a just-expired row before it is gone for good. */
const BOOKING_OTP_PURGE_GRACE_MS = 60 * 60 * 1000;
/** How long a locally-outboxed SMS (the code itself, in the clear) stays readable on the admin outbox page before
 * it is purged. Only ever populated by the local outbox provider -- a real provider sends the SMS itself and never
 * writes a row here. */
const SMS_MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface PurgeExpiredBookingDataResult {
  readonly deletedOtps: number;
  readonly deletedSmsMessages: number;
}

/**
 * Deletes booking_otps rows that expired more than an hour ago, and sms_messages rows older than 7 days -- the two
 * places patient data (name, phone, note, and the OTP code itself while the local outbox is the SMS provider) sits
 * on the staff connection after it is no longer needed for anything. Called opportunistically from
 * requestBookingOtp (see its doc comment) rather than on a schedule: this app has no cron/worker process today, so
 * "run it, best-effort, on the traffic that already touches this table" is the simpler of the two options
 * considered (the other being a dedicated `pnpm` script run on a schedule) and needs no extra infrastructure.
 * Safe to call concurrently or skip for a while -- each call only ever deletes rows already past their own cutoff,
 * so calls never race each other into deleting something they shouldn't.
 */
export async function purgeExpiredBookingData(db: Database, now: Date): Promise<PurgeExpiredBookingDataResult> {
  const otpCutoff = new Date(now.getTime() - BOOKING_OTP_PURGE_GRACE_MS);
  const smsCutoff = new Date(now.getTime() - SMS_MESSAGE_RETENTION_MS);
  const [deletedOtps, deletedSms] = await Promise.all([
    db.delete(bookingOtps).where(lt(bookingOtps.expiresAt, otpCutoff)).returning({ id: bookingOtps.id }),
    db.delete(smsMessages).where(lt(smsMessages.createdAt, smsCutoff)).returning({ id: smsMessages.id }),
  ]);
  return { deletedOtps: deletedOtps.length, deletedSmsMessages: deletedSms.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Admin counts
// ---------------------------------------------------------------------------------------------------------------

export interface AppointmentCounts {
  /** Booked appointments that have not started yet. */
  readonly upcoming: number;
  /** Every appointment ever made, whatever its status. */
  readonly total: number;
  /** Active (not archived) practitioners. */
  readonly doctors: number;
}

/** Use with the staff connection: the staff console's appointments summary for one business. */
export async function countAppointments(db: Database, businessId: string): Promise<AppointmentCounts> {
  const [appointmentRows, doctorRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        upcoming: sql<number>`count(*) filter (where ${appointments.status} = 'booked' and ${appointments.startsAt} >= now())::int`,
      })
      .from(appointments)
      .where(eq(appointments.businessId, businessId)),
    db
      .select({ doctors: sql<number>`count(*)::int` })
      .from(practitioners)
      .where(and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt))),
  ]);
  return {
    upcoming: appointmentRows[0]?.upcoming ?? 0,
    total: appointmentRows[0]?.total ?? 0,
    doctors: doctorRows[0]?.doctors ?? 0,
  };
}
