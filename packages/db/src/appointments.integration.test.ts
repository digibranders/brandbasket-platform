import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addAppointmentService,
  bookSlot,
  BookingClosedError,
  claimOtpAttempt,
  countAppointments,
  countUnseenBookings,
  createBookingOtp,
  deleteBookingOtp,
  findAppointment,
  findAppointmentSettings,
  findBookingOtp,
  insertSmsMessage,
  listAppointmentServices,
  listAppointmentsForDates,
  listBusyIntervals,
  listSmsMessages,
  markAppointmentSeen,
  markOtpVerified,
  PatientNotFoundError,
  PatientOverlapError,
  personHasBookingOverlapping,
  purgeExpiredBookingData,
  readBookingContext,
  reassignAppointment,
  renameAppointmentService,
  setAppointmentServiceArchived,
  SlotTakenError,
  transitionAppointment,
  updateAppointmentSettings,
  type AppointmentRow,
  type BookingOtpPayload,
  type NewAppointment,
  type NewBookingOtp,
} from "./queries/appointments";
import { setBusinessModule, setBusinessTimeZone } from "./queries/business-modules";
import { readPractitionerSchedules } from "./queries/practitioners";
import {
  appointments,
  appointmentServices,
  bookingOtps,
  businesses,
  businessMembers,
  patients,
  practitionerHours,
  practitionerLeave,
  practitioners,
  smsMessages,
  users,
} from "./schema";
import { withTenantScope, type ScopedTransaction, type TenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

/** Matches the constant the platform will pass as `maxAttempts` (packages/shared's OTP_MAX_ATTEMPTS); packages/db
 * does not depend on @fynix/shared, so it is written literally here as it is in that package. */
const MAX_OTP_ATTEMPTS = 5;

const OWNER_A = "owner-a";
const EDITOR_A = "editor-a";
const OWNER_B = "owner-b";
const STAFF_USER = "staff-1";
const NOW = new Date("2037-09-25T10:00:00.000Z");
/** After newAppointmentInput()'s default startsAt (2037-10-01T04:00:00Z): transitionAppointment's "done" edge now
 * requires starts_at <= now, so every test that transitions a default-shaped booking to done must pass a `now`
 * from after it started, not the (earlier) top-level NOW. */
const AFTER_APPOINTMENT_STARTS = new Date("2037-10-01T05:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

function scopeFor(who: "ownerA" | "editorA" | "ownerB"): TenantScope {
  if (who === "ownerA") return { userId: OWNER_A, businessId: businessA };
  if (who === "editorA") return { userId: EDITOR_A, businessId: businessA };
  return { userId: OWNER_B, businessId: businessB };
}

function as<T>(who: "ownerA" | "editorA" | "ownerB", work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, scopeFor(who), work);
}

async function enableAppointments(businessId: string): Promise<void> {
  await setBusinessTimeZone(dbs.staff.db, businessId, "Asia/Kolkata");
  await setBusinessModule(dbs.staff.db, { businessId, module: "appointments", enabled: true, staffUserId: STAFF_USER, now: NOW });
}

/** The practitioner setBusinessModule seeds when appointments is switched on, for fixtures that insert rows directly. */
async function defaultPractitionerId(businessId: string): Promise<string> {
  const [row] = await dbs.staff.db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.businessId, businessId))
    .orderBy(asc(practitioners.position), asc(practitioners.id))
    .limit(1);
  if (row === undefined) throw new Error(`Business ${businessId} has no practitioner; switch appointments on first`);
  return row.id;
}

/** A booking's own fields, without the candidate practitioners bookSlot chooses among. */
type BookingFields = Omit<NewAppointment, "practitionerIds">;

/** Books `fields` with the business's default (seeded) practitioner as the only candidate: the single-calendar
 * behaviour every booking had before a clinic could have more than one doctor. */
async function book(businessId: string, fields: BookingFields): Promise<AppointmentRow> {
  return bookSlot(dbs.staff.db, businessId, { ...fields, practitionerIds: [await defaultPractitionerId(businessId)] });
}

/** A second (or third) doctor, inserted on the staff connection so a test does not depend on the scoped API. */
async function addDoctor(businessId: string, name: string, position: number): Promise<string> {
  const [row] = await dbs.staff.db.insert(practitioners).values({ businessId, name, position }).returning({ id: practitioners.id });
  if (row === undefined) throw new Error(`Practitioner "${name}" was not inserted`);
  return row.id;
}

async function archiveDoctor(id: string): Promise<void> {
  await dbs.staff.db.update(practitioners).set({ archivedAt: NOW }).where(eq(practitioners.id, id));
}

/** 2037-10-01 is a Thursday; 09:30-10:00 IST is 04:00-04:30 UTC. */
function newAppointmentInput(overrides: Partial<BookingFields> = {}): BookingFields {
  return {
    patientName: "Priya Shah",
    phone: "+919876543210",
    serviceId: null,
    serviceName: "Consultation",
    localDate: "2037-10-01",
    localStart: "09:30",
    localEnd: "10:00",
    startsAt: new Date("2037-10-01T04:00:00.000Z"),
    endsAt: new Date("2037-10-01T04:30:00.000Z"),
    ...overrides,
  };
}

/** Like newAppointmentInput(), but starting a real hour ago (wall-clock, not the fictional `NOW`/
 * AFTER_APPOINTMENT_STARTS test constants): appointments_guard_customer_transition's "done" guard checks
 * `OLD.starts_at > now()` against Postgres's own now(), which no JS `now` a test passes ever changes, so any test
 * that actually needs a "done" transition to be *allowed* by that trigger needs a slot whose starts_at is behind
 * real time, not just behind this suite's simulated calendar. */
function pastAppointmentInput(overrides: Partial<BookingFields> = {}): BookingFields {
  return newAppointmentInput({
    startsAt: new Date(Date.now() - 60 * 60 * 1000),
    endsAt: new Date(Date.now() - 30 * 60 * 1000),
    ...overrides,
  });
}

function newOtpPayload(overrides: Partial<BookingOtpPayload> = {}): BookingOtpPayload {
  return {
    name: "Priya Shah",
    phone: "+919876543210",
    serviceId: null,
    serviceName: "Consultation",
    date: "2037-10-01",
    start: "09:30",
    end: "10:00",
    startsAt: "2037-10-01T04:00:00.000Z",
    endsAt: "2037-10-01T04:30:00.000Z",
    ...overrides,
  };
}

function newOtpInput(overrides: Partial<NewBookingOtp> = {}): NewBookingOtp {
  return {
    businessId: businessA,
    phone: "+919876543210",
    codeHash: "deadbeefcafe",
    payload: newOtpPayload(),
    expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    ...overrides,
  };
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: EDITOR_A, name: "Eli Ray", email: "eli@example.com" },
    { id: OWNER_B, name: "Ben Ortiz", email: "ben@example.com" },
    { id: STAFF_USER, name: "Sam Staff", email: "sam@fynix.test" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-clinic", name: "Riverside Clinic" },
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-clinic");
  businessB = idForSlug(inserted, "harbour-salon");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessA, userId: EDITOR_A, role: "editor" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

describe("appointments while the module is off", () => {
  it("hides existing rows from the scoped tenant even though they exist", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    // Insert directly on the staff connection: the module is off, so fynix_app could not have booked this, and
    // no default practitioner was ever seeded for it.
    const [practitioner] = await dbs.staff.db
      .insert(practitioners)
      .values({ businessId: businessA, name: "Dr Meera Iyer", position: 0 })
      .returning({ id: practitioners.id });
    if (practitioner === undefined) throw new Error("Practitioner was not inserted");
    await dbs.staff.db.insert(appointments).values({
      businessId: businessA,
      practitionerId: practitioner.id,
      patientName: "Priya Shah",
      phone: "+919876543210",
      localDate: "2037-10-01",
      localStart: "09:30",
      localEnd: "10:00",
      startsAt: new Date("2037-10-01T04:00:00.000Z"),
      endsAt: new Date("2037-10-01T04:30:00.000Z"),
    });

    expect(await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"))).toEqual([]);
  });

  it("refuses fynix_app writes to appointment_settings while the module is off", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    expect(await as("ownerA", (tx) => updateAppointmentSettings(tx, { accepting: false }, NOW))).toBe(false);
  });
});

describe("row-level security once appointments is on", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
    await enableAppointments(businessB);
  });

  it("fynix_app cannot INSERT appointments directly", async () => {
    const practitionerId = await defaultPractitionerId(businessA);
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.insert(appointments).values({
          businessId: businessA,
          practitionerId,
          patientName: "Sneaky",
          phone: "+919000000000",
          localDate: "2037-10-01",
          localStart: "09:30",
          localEnd: "10:00",
          startsAt: new Date("2037-10-01T04:00:00.000Z"),
          endsAt: new Date("2037-10-01T04:30:00.000Z"),
        }),
      ),
    );
    expect(message).toMatch(/permission denied for table appointments/);
  });

  it("a tenant sees only its own appointments", async () => {
    await book(businessA, newAppointmentInput());
    await book(businessB, newAppointmentInput());

    const ownAppointments = await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"));
    expect(ownAppointments).toHaveLength(1);
    const otherAppointments = await as("ownerB", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"));
    expect(otherAppointments).toHaveLength(1);
    expect(ownAppointments[0]?.id).not.toBe(otherAppointments[0]?.id);
  });

  it("fynix_app cannot SELECT booking_otps", async () => {
    await createBookingOtp(dbs.staff.db, newOtpInput());
    const message = await captureErrorText(as("ownerA", (tx) => tx.select().from(bookingOtps)));
    expect(message).toMatch(/permission denied for table booking_otps/);
  });

  it("fynix_app cannot SELECT sms_messages", async () => {
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "111111 is your code" });
    const message = await captureErrorText(as("ownerA", (tx) => tx.select().from(smsMessages)));
    expect(message).toMatch(/permission denied for table sms_messages/);
  });
});

describe("security properties", () => {
  it("fynix_public is denied on appointments", async () => {
    const message = await captureErrorText(dbs.publicRole.db.select().from(appointments));
    expect(message).toMatch(/permission denied for table appointments/);
  });

  it("fynix_public is denied on booking_otps", async () => {
    const message = await captureErrorText(dbs.publicRole.db.select().from(bookingOtps));
    expect(message).toMatch(/permission denied for table booking_otps/);
  });

  it("fynix_public is denied on patients", async () => {
    const message = await captureErrorText(dbs.publicRole.db.select().from(patients));
    expect(message).toMatch(/permission denied for table patients/);
  });

  it("fynix_public is denied on sms_messages", async () => {
    const message = await captureErrorText(dbs.publicRole.db.select().from(smsMessages));
    expect(message).toMatch(/permission denied for table sms_messages/);
  });

  it("app_module_enabled is not SECURITY DEFINER", async () => {
    const rows = await dbs.owner.db.execute<{ prosecdef: boolean }>(
      sql`select prosecdef from pg_proc where proname = 'app_module_enabled'`,
    );
    expect(rows.rows[0]?.prosecdef).toBe(false);
  });

  it("the trigger function pins search_path to pg_catalog", async () => {
    const rows = await dbs.owner.db.execute<{ proconfig: string[] | null }>(
      sql`select proconfig from pg_proc where proname = 'appointments_guard_customer_transition'`,
    );
    expect(rows.rows[0]?.proconfig).toContain("search_path=pg_catalog");
  });

  it("a pg_temp business_modules table cannot fool app_module_enabled into thinking the module is on", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    // Inserted directly on the staff connection while the module is off -- fynix_app could never do this itself,
    // and should never be able to see it back, temp-table shadowing or not.
    await dbs.staff.db.insert(appointmentServices).values({ businessId: businessA, name: "Consultation", position: 0 });

    const rows = await as("ownerA", async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE business_modules (business_id uuid, module text, enabled boolean)`);
      await tx.execute(sql`INSERT INTO pg_temp.business_modules VALUES (${businessA}, 'appointments', true)`);
      return tx.select().from(appointmentServices).where(eq(appointmentServices.businessId, businessA));
    });
    expect(rows).toEqual([]);
  });
});

describe("services", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("adds services at the end of the position order", async () => {
    const first = await as("ownerA", (tx) => addAppointmentService(tx, "Consultation"));
    const second = await as("ownerA", (tx) => addAppointmentService(tx, "Cleaning"));
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    const listed = await as("ownerA", (tx) => listAppointmentServices(tx, { includeArchived: false }));
    expect(listed.map((row) => row.name)).toEqual(["Consultation", "Cleaning"]);
  });

  it("renames a service", async () => {
    const service = await as("ownerA", (tx) => addAppointmentService(tx, "Consultation"));
    expect(await as("ownerA", (tx) => renameAppointmentService(tx, service.id, "Initial consultation"))).toBe(true);
    const listed = await as("ownerA", (tx) => listAppointmentServices(tx, { includeArchived: false }));
    expect(listed[0]?.name).toBe("Initial consultation");
  });

  it("archives and unarchives a service, excluding it from the default list while archived", async () => {
    const service = await as("ownerA", (tx) => addAppointmentService(tx, "Consultation"));
    expect(await as("ownerA", (tx) => setAppointmentServiceArchived(tx, service.id, true, NOW))).toBe(true);

    expect(await as("ownerA", (tx) => listAppointmentServices(tx, { includeArchived: false }))).toEqual([]);
    const withArchived = await as("ownerA", (tx) => listAppointmentServices(tx, { includeArchived: true }));
    expect(withArchived).toHaveLength(1);
    expect(withArchived[0]?.archivedAt).not.toBeNull();

    expect(await as("ownerA", (tx) => setAppointmentServiceArchived(tx, service.id, false, NOW))).toBe(true);
    expect(await as("ownerA", (tx) => listAppointmentServices(tx, { includeArchived: false }))).toHaveLength(1);
  });

  it("fails once A's own module is switched back off", async () => {
    const service = await as("ownerA", (tx) => addAppointmentService(tx, "Consultation"));
    const booked = await book(businessA, newAppointmentInput());

    await setBusinessModule(dbs.staff.db, { businessId: businessA, module: "appointments", enabled: false, staffUserId: STAFF_USER, now: NOW });

    expect(await as("ownerA", (tx) => renameAppointmentService(tx, service.id, "Nope"))).toBe(false);
    expect(await as("ownerA", (tx) => setAppointmentServiceArchived(tx, service.id, true, NOW))).toBe(false);
    const insertMessage = await captureErrorText(as("ownerA", (tx) => addAppointmentService(tx, "New service")));
    expect(insertMessage).toMatch(/row-level security/);
    expect(await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW))).toBeNull();
    expect(await as("ownerA", (tx) => updateAppointmentSettings(tx, { accepting: false }, NOW))).toBe(false);
  });
});

describe("settings", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("reads default settings and updates them", async () => {
    const settings = await as("ownerA", (tx) => findAppointmentSettings(tx));
    expect(settings).toEqual({
      accepting: true,
      pausedMessage: null,
      slotMinutes: 30,
      minNoticeMinutes: 60,
      horizonDays: 28,
    });

    expect(
      await as("ownerA", (tx) =>
        updateAppointmentSettings(
          tx,
          { accepting: false, pausedMessage: "Back Monday", slotMinutes: 15, minNoticeMinutes: 0, horizonDays: 7 },
          NOW,
        ),
      ),
    ).toBe(true);
    expect(await as("ownerA", (tx) => findAppointmentSettings(tx))).toEqual({
      accepting: false,
      pausedMessage: "Back Monday",
      slotMinutes: 15,
      minNoticeMinutes: 0,
      horizonDays: 7,
    });
  });

  it("clears a blank pausedMessage to null", async () => {
    await as("ownerA", (tx) => updateAppointmentSettings(tx, { pausedMessage: "Back Monday" }, NOW));
    await as("ownerA", (tx) => updateAppointmentSettings(tx, { pausedMessage: "   " }, NOW));
    expect((await as("ownerA", (tx) => findAppointmentSettings(tx)))?.pausedMessage).toBeNull();
  });

  it("rejects an out-of-range slot length at the database", async () => {
    const message = await captureErrorText(as("ownerA", (tx) => updateAppointmentSettings(tx, { slotMinutes: 17 }, NOW)));
    expect(message).toMatch(/appointment_settings_slot_minutes_check/);
  });
});

describe("countUnseenBookings and markAppointmentSeen", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("counts booked appointments with no seen_at yet", async () => {
    const first = await book(businessA, newAppointmentInput());
    await book(businessA, newAppointmentInput({
        localStart: "10:00",
        localEnd: "10:30",
        startsAt: new Date("2037-10-01T04:30:00.000Z"),
        endsAt: new Date("2037-10-01T05:00:00.000Z"),
      }),
    );
    expect(await as("ownerA", (tx) => countUnseenBookings(tx))).toBe(2);

    expect(await as("ownerA", (tx) => markAppointmentSeen(tx, first.id, NOW))).toBe(true);
    expect(await as("ownerA", (tx) => countUnseenBookings(tx))).toBe(1);
  });

  it("excludes a cancelled appointment even though it was never seen", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    expect(await as("ownerA", (tx) => countUnseenBookings(tx))).toBe(0);
  });

  it("marks a booking seen, and only once", async () => {
    const booked = await book(businessA, newAppointmentInput());
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.seenAt).toBeNull();

    expect(await as("ownerA", (tx) => markAppointmentSeen(tx, booked.id, NOW))).toBe(true);
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.seenAt).toEqual(NOW);

    // Single-set: a second call, even with a later timestamp, does not move it and reports it did nothing.
    const later = new Date(NOW.getTime() + 60_000);
    expect(await as("ownerA", (tx) => markAppointmentSeen(tx, booked.id, later))).toBe(false);
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.seenAt).toEqual(NOW);
  });

  it("returns false for another business's appointment id", async () => {
    await enableAppointments(businessB);
    const bookedB = await book(businessB, newAppointmentInput());
    expect(await as("ownerA", (tx) => markAppointmentSeen(tx, bookedB.id, NOW))).toBe(false);
  });

  it("returns false for a non-UUID appointment id", async () => {
    expect(await as("ownerA", (tx) => markAppointmentSeen(tx, "not-a-uuid", NOW))).toBe(false);
  });
});

describe("transitionAppointment", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
    await enableAppointments(businessB);
  });

  it("cancels a booked appointment, setting cancel_reason, cancelled_at and handled_by", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const cancelled = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: "Patient asked" }, OWNER_A, NOW));
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Patient asked", handledByUserId: OWNER_A });
    expect(cancelled?.cancelledAt).toEqual(NOW);
  });

  it("marks a booked appointment done, setting done_at and handled_by", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const done = await as("ownerA", (tx) =>
      transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS),
    );
    expect(done).toMatchObject({ status: "done", handledByUserId: OWNER_A });
    expect(done?.doneAt).toEqual(AFTER_APPOINTMENT_STARTS);
  });

  it("cannot mark a booking done before it has started", async () => {
    // newAppointmentInput()'s default startsAt is 2037-10-01T04:00:00Z; NOW is 2037-09-25, well before it.
    const booked = await book(businessA, newAppointmentInput());
    const result = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, NOW));
    expect(result).toBeNull();

    // Still booked -- the attempt did not partially apply.
    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.status).toBe("booked");
  });

  it("can mark a booking done exactly at its start time", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const done = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, booked.startsAt));
    expect(done?.status).toBe("done");
  });

  it("marks a started booking a no-show, stamping no_show_at and handled_by and nothing else", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const noShow = await as("ownerA", (tx) =>
      transitionAppointment(tx, booked.id, { action: "no_show" }, OWNER_A, AFTER_APPOINTMENT_STARTS),
    );
    expect(noShow).toMatchObject({ status: "no_show", handledByUserId: OWNER_A, doneAt: null, cancelledAt: null, cancelReason: null });
    expect(noShow?.noShowAt).toEqual(AFTER_APPOINTMENT_STARTS);
  });

  it("cannot mark a booking a no-show before it has started", async () => {
    const booked = await book(businessA, newAppointmentInput());
    expect(await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "no_show" }, OWNER_A, NOW))).toBeNull();
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.status).toBe("booked");
  });

  it("cannot cancel, complete or no-show a booking that is already a no-show", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "no_show" }, OWNER_A, AFTER_APPOINTMENT_STARTS));
    for (const transition of [{ action: "cancel", reason: null }, { action: "done" }, { action: "no_show" }] as const) {
      expect(await as("ownerA", (tx) => transitionAppointment(tx, booked.id, transition, OWNER_A, AFTER_APPOINTMENT_STARTS))).toBeNull();
    }
  });

  it("blanks a cancel reason left empty", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const cancelled = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: "   " }, OWNER_A, NOW));
    expect(cancelled?.cancelReason).toBeNull();
  });

  it("cannot cancel an appointment that is already done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS));
    const result = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    expect(result).toBeNull();
  });

  it("cannot mark a cancelled appointment done", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    const result = await as("ownerA", (tx) =>
      transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS),
    );
    expect(result).toBeNull();
  });

  it("returns null for another business's appointment id", async () => {
    const bookedB = await book(businessB, newAppointmentInput());
    const result = await as("ownerA", (tx) =>
      transitionAppointment(tx, bookedB.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS),
    );
    expect(result).toBeNull();
  });

  it("returns null for a non-UUID appointment id", async () => {
    const result = await as("ownerA", (tx) => transitionAppointment(tx, "not-a-uuid", { action: "done" }, OWNER_A, NOW));
    expect(result).toBeNull();
  });

  describe("handled_by_user_id across team members", () => {
    it.each(["done", "no_show"] as const)("lets a customer mark seen a future booking staff already marked %s", async (status) => {
      const booked = await book(businessA, newAppointmentInput());
      await dbs.staff.db.update(appointments).set({
        status,
        doneAt: status === "done" ? NOW : null,
        noShowAt: status === "no_show" ? NOW : null,
        handledByUserId: STAFF_USER,
      }).where(eq(appointments.id, booked.id));

      expect(await as("editorA", (tx) => markAppointmentSeen(tx, booked.id, NOW))).toBe(true);
      const found = await as("editorA", (tx) => findAppointment(tx, booked.id));
      expect(found?.status).toBe(status);
      expect(found?.handledByUserId).toBe(STAFF_USER);
      expect(found?.seenAt).toEqual(NOW);
    });

    it("lets a second team member mark seen an appointment the first member handled, keeping the handler", async () => {
      const booked = await book(businessA, pastAppointmentInput());
      await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS));

      expect(await as("editorA", (tx) => markAppointmentSeen(tx, booked.id, NOW))).toBe(true);
      const found = await as("editorA", (tx) => findAppointment(tx, booked.id));
      expect(found?.seenAt).toEqual(NOW);
      expect(found?.handledByUserId).toBe(OWNER_A);
    });

    it("refuses fynix_app setting handled_by_user_id to someone else's id", async () => {
      const booked = await book(businessA, newAppointmentInput());
      const message = await captureErrorText(
        as("editorA", (tx) => tx.update(appointments).set({ handledByUserId: OWNER_A }).where(eq(appointments.id, booked.id))),
      );
      expect(message).toMatch(/(fynix_app|fynix_app) may only set handled_by_user_id to its own user id/);
    });

    it("refuses clearing the handler recorded by an earlier transition", async () => {
      const booked = await book(businessA, pastAppointmentInput());
      await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS));

      const message = await captureErrorText(
        as("editorA", (tx) => tx.update(appointments).set({ handledByUserId: null }).where(eq(appointments.id, booked.id))),
      );
      expect(message).toMatch(/(fynix_app|fynix_app) may only set handled_by_user_id to its own user id/);
      expect((await as("editorA", (tx) => findAppointment(tx, booked.id)))?.handledByUserId).toBe(OWNER_A);
    });

    it("a transition by the second member sets handled_by to the second member", async () => {
      const booked = await book(businessA, pastAppointmentInput());
      const updated = await as("editorA", (tx) =>
        transitionAppointment(tx, booked.id, { action: "done" }, EDITOR_A, AFTER_APPOINTMENT_STARTS),
      );
      expect(updated?.handledByUserId).toBe(EDITOR_A);
    });
  });
});

describe("appointments_guard_customer_transition trigger", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("lets fynix_app move booked to cancelled", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const cancelled = await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: "Reschedule" }, OWNER_A, NOW));
    expect(cancelled?.status).toBe("cancelled");
  });

  it("lets fynix_app move booked to done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const done = await as("ownerA", (tx) =>
      transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS),
    );
    expect(done?.status).toBe("done");
  });

  it("refuses to mark an appointment done before its slot has started, even bypassing transitionAppointment's own WHERE guard", async () => {
    // newAppointmentInput()'s default starts_at (2037-10-01T04:00:00Z) is well after NOW: a raw UPDATE, not
    // transitionAppointment (whose own "done" edge already adds `starts_at <= now` to its WHERE clause and so
    // would just update zero rows here rather than reach the trigger), is what actually exercises the trigger's
    // own backstop for this rule.
    const booked = await book(businessA, newAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "done", doneAt: NOW }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not mark an appointment done before it has started/);
  });

  it("refuses to move a done appointment back to booked", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "done" }, OWNER_A, AFTER_APPOINTMENT_STARTS));
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "booked" }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not move an appointment from done to booked/);
  });

  it("refuses to move a cancelled appointment back to booked", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "booked" }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not move an appointment from cancelled to booked/);
  });

  it("refuses to mark a no-show before its slot has started, even bypassing transitionAppointment's own WHERE guard", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "no_show", noShowAt: NOW }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not mark an appointment a no-show before it has started/);
  });

  it("refuses a no-show that does not stamp no_show_at", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "no_show" }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) must stamp no_show_at, and only no_show_at, when marking an appointment a no-show/);
  });

  it("refuses a no-show that also sets done_at", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ status: "no_show", noShowAt: NOW, doneAt: NOW }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) must stamp no_show_at, and only no_show_at, when marking an appointment a no-show/);
  });

  it("refuses to move a no-show back to booked or on to done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "no_show" }, OWNER_A, AFTER_APPOINTMENT_STARTS));
    const backMessage = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "booked", noShowAt: null }).where(eq(appointments.id, booked.id))),
    );
    expect(backMessage).toMatch(/(fynix_app|fynix_app) may not move an appointment from no_show to booked/);
    const doneMessage = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ status: "done", doneAt: NOW }).where(eq(appointments.id, booked.id))),
    );
    expect(doneMessage).toMatch(/(fynix_app|fynix_app) may not move an appointment from no_show to done/);
  });

  it("refuses to change no_show_at once a booking is a no-show", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "no_show" }, OWNER_A, AFTER_APPOINTMENT_STARTS));
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ noShowAt: NOW }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not change cancel_reason, cancelled_at, done_at or no_show_at without changing status/);
  });

  it("refuses to set no_show_at when marking an appointment done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ status: "done", doneAt: NOW, noShowAt: NOW }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not set cancel_reason, cancelled_at or no_show_at when marking an appointment done/);
  });

  it("refuses an arbitrary edit of a booking's phone, name, email or note", async () => {
    const booked = await book(businessA, newAppointmentInput());
    for (const set of [
      { phone: "+919000000001" },
      { patientName: "Someone Else" },
      { email: "priya@example.com" },
      { patientNote: "Sneaky" },
    ]) {
      const message = await captureErrorText(
        as("ownerA", (tx) => tx.update(appointments).set(set).where(eq(appointments.id, booked.id))),
      );
      expect(message).toMatch(/(fynix_app|fynix_app) may only change a booking's patient details by merging or erasing a patient/);
    }
  });

  it("refuses a same-status change to cancel_reason", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ cancelReason: "Sneaky" }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not change cancel_reason, cancelled_at, done_at or no_show_at without changing status/);
  });

  it("refuses a same-status change to clinic_note: the private note is gone, only erasing a patient clears it", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ clinicNote: "Allergic to penicillin" }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may only change a booking's patient details by merging or erasing a patient/);
  });

  it("refuses to set cancel_reason when marking an appointment done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ status: "done", doneAt: NOW, cancelReason: "Sneaky" }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not set cancel_reason, cancelled_at or no_show_at when marking an appointment done/);
  });

  it("refuses to set cancelled_at when marking an appointment done", async () => {
    const booked = await book(businessA, pastAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ status: "done", doneAt: NOW, cancelledAt: NOW }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not set cancel_reason, cancelled_at or no_show_at when marking an appointment done/);
  });

  it("refuses to set done_at when cancelling an appointment", async () => {
    const booked = await book(businessA, newAppointmentInput());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ status: "cancelled", cancelledAt: NOW, doneAt: NOW }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not set done_at or no_show_at when cancelling an appointment/);
  });

  it("lets fynix_app set seen_at from null to a value, without changing status", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => tx.update(appointments).set({ seenAt: NOW }).where(eq(appointments.id, booked.id)));
    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.seenAt).toEqual(NOW);
  });

  it("lets fynix_app set seen_at in the same statement as a status transition", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) =>
      tx.update(appointments).set({ status: "cancelled", cancelledAt: NOW, seenAt: NOW }).where(eq(appointments.id, booked.id)),
    );
    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.status).toBe("cancelled");
    expect(found?.seenAt).toEqual(NOW);
  });

  it("refuses to clear seen_at back to null once it is set", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => markAppointmentSeen(tx, booked.id, NOW));
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ seenAt: null }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not clear or change seen_at once it is set/);
  });

  it("refuses to change seen_at to a different timestamp once it is set", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => markAppointmentSeen(tx, booked.id, NOW));
    const later = new Date(NOW.getTime() + 60_000);
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ seenAt: later }).where(eq(appointments.id, booked.id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may not clear or change seen_at once it is set/);
  });

  it("allows re-setting seen_at to the exact same value it already has", async () => {
    const booked = await book(businessA, newAppointmentInput());
    await as("ownerA", (tx) => markAppointmentSeen(tx, booked.id, NOW));
    await expect(
      as("ownerA", (tx) => tx.update(appointments).set({ seenAt: NOW }).where(eq(appointments.id, booked.id))),
    ).resolves.not.toThrow();
  });
});

describe("listAppointmentsForDates", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("includes cancelled appointments and orders by local_date, local_start, id", async () => {
    const early = await book(businessA, newAppointmentInput());
    const late = await book(businessA, newAppointmentInput({
        localStart: "10:00",
        localEnd: "10:30",
        startsAt: new Date("2037-10-01T04:30:00.000Z"),
        endsAt: new Date("2037-10-01T05:00:00.000Z"),
      }),
    );
    await as("ownerA", (tx) => transitionAppointment(tx, early.id, { action: "cancel", reason: null }, OWNER_A, NOW));

    const listed = await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"));
    expect(listed.map((row) => row.id)).toEqual([early.id, late.id]);
    expect(listed[0]?.status).toBe("cancelled");
  });

  it("excludes appointments outside the date range", async () => {
    await book(businessA, newAppointmentInput());
    expect(await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-02", "2037-10-08"))).toEqual([]);
  });

  it("shows the linked patient's current name, keeping the booking's own snapshot underneath", async () => {
    const booked = await book(businessA, newAppointmentInput({ patientName: "priya" }));
    expect(booked.patientId).not.toBeNull();
    await dbs.staff.db.update(patients).set({ name: "Priya Shah" }).where(eq(patients.id, booked.patientId ?? ""));

    const [listed] = await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"));
    expect(listed).toMatchObject({ id: booked.id, patientId: booked.patientId, patientName: "Priya Shah", source: "online", noShowAt: null });
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.patientName).toBe("Priya Shah");

    const [stored] = await dbs.staff.db.select({ patientName: appointments.patientName }).from(appointments).where(eq(appointments.id, booked.id));
    expect(stored?.patientName).toBe("priya");
  });
});

describe("bookSlot", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("lets exactly one of two concurrent bookings for the same slot win", async () => {
    const input = newAppointmentInput();
    const results = await Promise.allSettled([book(businessA, input), book(businessA, input)]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<AppointmentRow> => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SlotTakenError);

    const counts = await countAppointments(dbs.staff.db, businessA);
    expect(counts.total).toBe(1);
  });

  it("refuses an overlapping but not identical interval", async () => {
    await book(businessA, newAppointmentInput());
    const overlapping = newAppointmentInput({
      localStart: "09:45",
      localEnd: "10:15",
      startsAt: new Date("2037-10-01T04:15:00.000Z"),
      endsAt: new Date("2037-10-01T04:45:00.000Z"),
    });
    await expect(book(businessA, overlapping)).rejects.toBeInstanceOf(SlotTakenError);
  });

  it("lets exactly one of two concurrent, differently-timed but overlapping bookings win", async () => {
    // 09:30-10:00 and 09:45-10:15 overlap but neither starts_at matches the other, so the partial unique index on
    // (practitioner_id, starts_at) alone would let both insert -- only the advisory lock's serialised overlap check
    // stops this pair.
    const first = newAppointmentInput({
      localStart: "09:30",
      localEnd: "10:00",
      startsAt: new Date("2037-10-01T04:00:00.000Z"),
      endsAt: new Date("2037-10-01T04:30:00.000Z"),
    });
    const second = newAppointmentInput({
      localStart: "09:45",
      localEnd: "10:15",
      startsAt: new Date("2037-10-01T04:15:00.000Z"),
      endsAt: new Date("2037-10-01T04:45:00.000Z"),
    });
    const results = await Promise.allSettled([book(businessA, first), book(businessA, second)]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<AppointmentRow> => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SlotTakenError);

    const counts = await countAppointments(dbs.staff.db, businessA);
    expect(counts.total).toBe(1);
  });

  it("allows an adjacent, non-overlapping slot", async () => {
    await book(businessA, newAppointmentInput());
    const adjacent = newAppointmentInput({
      localStart: "10:00",
      localEnd: "10:30",
      startsAt: new Date("2037-10-01T04:30:00.000Z"),
      endsAt: new Date("2037-10-01T05:00:00.000Z"),
    });
    await expect(book(businessA, adjacent)).resolves.toMatchObject({ status: "booked" });
  });

  it("frees the slot once the appointment is cancelled", async () => {
    const input = newAppointmentInput();
    const booked = await book(businessA, input);
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: "Patient asked" }, OWNER_A, NOW));

    const rebooked = await book(businessA, input);
    expect(rebooked.id).not.toBe(booked.id);
  });

  it("does not let a different business's booking collide", async () => {
    await enableAppointments(businessB);
    await book(businessA, newAppointmentInput());
    await expect(book(businessB, newAppointmentInput())).resolves.toMatchObject({ status: "booked" });
  });

  it("refuses a serviceId belonging to another business", async () => {
    await enableAppointments(businessB);
    const otherService = await as("ownerB", (tx) => addAppointmentService(tx, "Cleaning"));

    await expect(
      book(businessA, newAppointmentInput({ serviceId: otherService.id, serviceName: "Cleaning" })),
    ).rejects.toThrow();
  });

  it("stores a blank serviceName as null", async () => {
    const booked = await book(businessA, newAppointmentInput({ serviceName: "   " }));
    expect(booked.serviceName).toBeNull();
  });

  it("normalises localStart/localEnd to HH:MM on every row it returns", async () => {
    const booked = await book(businessA, newAppointmentInput({ localStart: "09:05", localEnd: "09:35" }));
    expect(booked.localStart).toBe("09:05");

    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.localStart).toBe("09:05");

    const [listed] = await as("ownerA", (tx) => listAppointmentsForDates(tx, "2037-10-01", "2037-10-01"));
    expect(listed?.localStart).toBe("09:05");
  });

  it("throws BookingClosedError and inserts nothing once the module is switched off after the lock is taken", async () => {
    await setBusinessModule(dbs.staff.db, { businessId: businessA, module: "appointments", enabled: false, staffUserId: STAFF_USER, now: NOW });
    await expect(book(businessA, newAppointmentInput())).rejects.toBeInstanceOf(BookingClosedError);
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ upcoming: 0, total: 0 });
  });

  it("throws BookingClosedError and inserts nothing while the business has paused online booking", async () => {
    await as("ownerA", (tx) => updateAppointmentSettings(tx, { accepting: false }, NOW));
    await expect(book(businessA, newAppointmentInput())).rejects.toBeInstanceOf(BookingClosedError);
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ upcoming: 0, total: 0 });
  });

  it("books while paused when asked to ignore the pause, but never while the module is off", async () => {
    const practitionerIds = [await defaultPractitionerId(businessA)];
    await as("ownerA", (tx) => updateAppointmentSettings(tx, { accepting: false }, NOW));
    const booked = await bookSlot(
      dbs.staff.db,
      businessA,
      { ...newAppointmentInput(), practitionerIds, source: "clinic" },
      { ignorePause: true },
    );
    expect(booked).toMatchObject({ status: "booked", source: "clinic" });

    await setBusinessModule(dbs.staff.db, { businessId: businessA, module: "appointments", enabled: false, staffUserId: STAFF_USER, now: NOW });
    const later = newAppointmentInput({
      localStart: "10:00",
      localEnd: "10:30",
      startsAt: new Date("2037-10-01T04:30:00.000Z"),
      endsAt: new Date("2037-10-01T05:00:00.000Z"),
    });
    await expect(
      bookSlot(dbs.staff.db, businessA, { ...later, practitionerIds }, { ignorePause: true }),
    ).rejects.toBeInstanceOf(BookingClosedError);
  });

  it("links a first booking to a new patient and records it as an online booking by default", async () => {
    const booked = await book(businessA, newAppointmentInput());
    expect(booked.source).toBe("online");
    const [patient] = await dbs.staff.db.select().from(patients).where(eq(patients.businessId, businessA));
    expect(patient).toMatchObject({ id: booked.patientId, name: "Priya Shah", phone: "+919876543210", altPhone: null, tags: [] });
  });

  it("books an existing patient by id under their current name and phone, whatever the input says", async () => {
    const first = await book(businessA, newAppointmentInput());
    const patientId = first.patientId ?? "";
    await dbs.staff.db.update(patients).set({ name: "Priya S. Shah" }).where(eq(patients.id, patientId));

    const again = await bookSlot(dbs.staff.db, businessA, {
      ...newAppointmentInput({
        patientName: "ignored",
        phone: "+919000000009",
        localDate: "2037-10-02",
        startsAt: new Date("2037-10-02T04:00:00.000Z"),
        endsAt: new Date("2037-10-02T04:30:00.000Z"),
      }),
      patientId,
      source: "clinic",
      practitionerIds: [await defaultPractitionerId(businessA)],
    });
    expect(again).toMatchObject({ patientId, patientName: "Priya S. Shah", phone: "+919876543210", source: "clinic" });
    expect(await dbs.staff.db.select().from(patients).where(eq(patients.businessId, businessA))).toHaveLength(1);
  });

  it("throws PatientNotFoundError and inserts nothing for another business's, an unknown or a malformed patient id", async () => {
    await enableAppointments(businessB);
    const other = await book(businessB, newAppointmentInput());
    const practitionerIds = [await defaultPractitionerId(businessA)];
    for (const patientId of [other.patientId ?? "", "01a0c2a2-a39c-781d-a454-b53a4f5d0000", "not-a-uuid"]) {
      await expect(
        bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), patientId, practitionerIds }),
      ).rejects.toBeInstanceOf(PatientNotFoundError);
    }
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ total: 0 });
  });

  it("rejects an appointment longer than one day at the database", async () => {
    const practitionerId = await defaultPractitionerId(businessA);
    const message = await captureErrorText(
      dbs.staff.db.insert(appointments).values({
        businessId: businessA,
        practitionerId,
        patientName: "Priya Shah",
        phone: "+919876543210",
        localDate: "2037-10-01",
        localStart: "09:30",
        localEnd: "10:00",
        startsAt: new Date("2037-10-01T04:00:00.000Z"),
        endsAt: new Date("2037-10-03T04:00:00.000Z"),
      }),
    );
    expect(message).toMatch(/appointments_max_duration_check/);
  });
});

describe("system reads: readBookingContext, listBusyIntervals, countAppointments", () => {
  it("reports disabled with no settings or services before the module is switched on", async () => {
    const context = await readBookingContext(dbs.staff.db, businessA);
    expect(context).toEqual({ enabled: false, timeZone: null, settings: null, services: [] });
  });

  it("reports enabled context with unarchived services only, the time zone and the booking window settings", async () => {
    await enableAppointments(businessA);
    const kept = await as("ownerA", (tx) => addAppointmentService(tx, "Consultation"));
    const archived = await as("ownerA", (tx) => addAppointmentService(tx, "Retired service"));
    await as("ownerA", (tx) => setAppointmentServiceArchived(tx, archived.id, true, NOW));

    const context = await readBookingContext(dbs.staff.db, businessA);
    expect(context.enabled).toBe(true);
    expect(context.timeZone).toBe("Asia/Kolkata");
    expect(context.settings).toMatchObject({ accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 });
    expect(context.services.map((service) => service.name)).toEqual([kept.name]);
  });

  it("counts upcoming and total bookings", async () => {
    await enableAppointments(businessA);
    await book(businessA, newAppointmentInput());
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ upcoming: 1, total: 1 });
  });

  it("excludes a past appointment from `upcoming` but keeps it in `total`", async () => {
    await enableAppointments(businessA);
    await book(businessA, newAppointmentInput({
        localDate: "2020-01-01",
        startsAt: new Date("2020-01-01T04:00:00.000Z"),
        endsAt: new Date("2020-01-01T04:30:00.000Z"),
      }),
    );
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ upcoming: 0, total: 1 });
  });

  it("counts the business's active doctors, leaving out archived ones and other businesses'", async () => {
    await enableAppointments(businessA);
    await enableAppointments(businessB);
    expect(await countAppointments(dbs.staff.db, businessA)).toEqual({ upcoming: 0, total: 0, doctors: 1 });

    await dbs.staff.db.insert(practitioners).values([
      { businessId: businessA, name: "Dr Rahul Menon", position: 1 },
      { businessId: businessA, name: "Dr Former", position: 2, archivedAt: NOW },
    ]);
    expect(await countAppointments(dbs.staff.db, businessA)).toEqual({ upcoming: 0, total: 0, doctors: 2 });
    expect(await countAppointments(dbs.staff.db, businessB)).toEqual({ upcoming: 0, total: 0, doctors: 1 });
  });

  it("lists busy intervals overlapping a window, excluding cancelled ones", async () => {
    await enableAppointments(businessA);
    const booked = await book(businessA, newAppointmentInput());
    const toCancel = await book(businessA, newAppointmentInput({
        localStart: "11:00",
        localEnd: "11:30",
        startsAt: new Date("2037-10-01T05:30:00.000Z"),
        endsAt: new Date("2037-10-01T06:00:00.000Z"),
      }),
    );
    await as("ownerA", (tx) => transitionAppointment(tx, toCancel.id, { action: "cancel", reason: null }, OWNER_A, NOW));

    const busy = await listBusyIntervals(dbs.staff.db, businessA, new Date("2037-10-01T00:00:00.000Z"), new Date("2037-10-02T00:00:00.000Z"));
    expect(busy).toEqual([{ startsAt: booked.startsAt, endsAt: booked.endsAt, practitionerId: await defaultPractitionerId(businessA) }]);
  });
});

describe("bookSlot choosing a practitioner", () => {
  let first = "";
  let second = "";

  beforeEach(async () => {
    await enableAppointments(businessA);
    first = await defaultPractitionerId(businessA);
    second = await addDoctor(businessA, "Dr Arjun Rao", 1);
  });

  const at1100 = {
    localStart: "11:00",
    localEnd: "11:30",
    startsAt: new Date("2037-10-01T05:30:00.000Z"),
    endsAt: new Date("2037-10-01T06:00:00.000Z"),
  } as const;

  function withCandidates(ids: readonly string[], fields: BookingFields = newAppointmentInput()): NewAppointment {
    return { ...fields, practitionerIds: ids };
  }

  it("records the practitioner on the booking it returns", async () => {
    const booked = await bookSlot(dbs.staff.db, businessA, withCandidates([first]));
    expect(booked.practitionerId).toBe(first);
    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.practitionerId).toBe(first);
  });

  it("falls through to the next candidate when the first is busy at that time", async () => {
    await bookSlot(dbs.staff.db, businessA, withCandidates([first]));
    const booked = await bookSlot(dbs.staff.db, businessA, withCandidates([first, second], newAppointmentInput({ patientName: "Aarav Shah" })));
    expect(booked.practitionerId).toBe(second);
  });

  it("prefers the candidate with fewer bookings that day when both are free", async () => {
    await bookSlot(dbs.staff.db, businessA, withCandidates([first], newAppointmentInput(at1100)));
    const booked = await bookSlot(dbs.staff.db, businessA, withCandidates([first, second]));
    expect(booked.practitionerId).toBe(second);
  });

  it("keeps the given order on a tie, counting only that day's non-cancelled bookings", async () => {
    await bookSlot(
      dbs.staff.db,
      businessA,
      withCandidates(
        [first],
        newAppointmentInput({
          localDate: "2037-10-02",
          startsAt: new Date("2037-10-02T04:00:00.000Z"),
          endsAt: new Date("2037-10-02T04:30:00.000Z"),
        }),
      ),
    );
    const cancelled = await bookSlot(dbs.staff.db, businessA, withCandidates([first], newAppointmentInput(at1100)));
    await as("ownerA", (tx) => transitionAppointment(tx, cancelled.id, { action: "cancel", reason: null }, OWNER_A, NOW));

    const booked = await bookSlot(dbs.staff.db, businessA, withCandidates([first, second]));
    expect(booked.practitionerId).toBe(first);
    const reversed = await bookSlot(dbs.staff.db, businessA, withCandidates([second, first], newAppointmentInput(at1100)));
    expect(reversed.practitionerId).toBe(second);
  });

  it("throws SlotTakenError when every candidate is busy", async () => {
    // Three different patients: the same patient twice at one time is refused for a different reason (PatientOverlapError).
    const aarav = newAppointmentInput({ patientName: "Aarav Shah" });
    const meera = newAppointmentInput({ patientName: "Meera Iyer" });
    await bookSlot(dbs.staff.db, businessA, withCandidates([first]));
    await expect(bookSlot(dbs.staff.db, businessA, withCandidates([first], aarav))).rejects.toBeInstanceOf(SlotTakenError);
    await bookSlot(dbs.staff.db, businessA, withCandidates([second], aarav));
    await expect(bookSlot(dbs.staff.db, businessA, withCandidates([first, second], meera))).rejects.toBeInstanceOf(SlotTakenError);
  });

  it("throws SlotTakenError and inserts nothing when there are no candidates", async () => {
    await expect(bookSlot(dbs.staff.db, businessA, withCandidates([]))).rejects.toBeInstanceOf(SlotTakenError);
    expect(await countAppointments(dbs.staff.db, businessA)).toMatchObject({ upcoming: 0, total: 0 });
  });

  it("skips an archived candidate, another business's practitioner and a non-UUID id", async () => {
    await enableAppointments(businessB);
    const foreign = await defaultPractitionerId(businessB);
    await archiveDoctor(first);

    const booked = await bookSlot(dbs.staff.db, businessA, withCandidates([first, foreign, "not-a-uuid", second]));
    expect(booked.practitionerId).toBe(second);
    await expect(bookSlot(dbs.staff.db, businessA, withCandidates([first], newAppointmentInput(at1100)))).rejects.toBeInstanceOf(
      SlotTakenError,
    );
    await expect(bookSlot(dbs.staff.db, businessA, withCandidates([foreign], newAppointmentInput(at1100)))).rejects.toBeInstanceOf(
      SlotTakenError,
    );
  });

  it("gives two concurrent bookings for the same slot one practitioner each", async () => {
    const input = withCandidates([first, second]);
    const other = withCandidates([first, second], newAppointmentInput({ patientName: "Aarav Shah" }));
    const results = await Promise.allSettled([bookSlot(dbs.staff.db, businessA, input), bookSlot(dbs.staff.db, businessA, other)]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<AppointmentRow> => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(2);
    expect(new Set(fulfilled.map((result) => result.value.practitionerId))).toEqual(new Set([first, second]));

    const third = withCandidates([first, second], newAppointmentInput({ patientName: "Meera Iyer" }));
    await expect(bookSlot(dbs.staff.db, businessA, third)).rejects.toBeInstanceOf(SlotTakenError);
  });
});

describe("readPractitionerSchedules", () => {
  it("returns active practitioners in order with their own hours and leave only", async () => {
    await enableAppointments(businessA);
    await enableAppointments(businessB);
    const clinicHoursDoctor = await defaultPractitionerId(businessA);
    const ownHoursDoctor = await addDoctor(businessA, "Dr Arjun Rao", 2);
    const archived = await addDoctor(businessA, "Dr Gone", 1);
    const foreign = await defaultPractitionerId(businessB);
    await dbs.staff.db.update(practitioners).set({ usesClinicHours: false, title: "Physiotherapist" }).where(eq(practitioners.id, ownHoursDoctor));
    await archiveDoctor(archived);

    await dbs.staff.db.insert(practitionerHours).values([
      { businessId: businessA, practitionerId: ownHoursDoctor, dayOfWeek: 2, openAllDay: true },
      { businessId: businessA, practitionerId: ownHoursDoctor, dayOfWeek: 0, opensAt: "16:00", closesAt: "19:00" },
      { businessId: businessA, practitionerId: ownHoursDoctor, dayOfWeek: 0, opensAt: "09:00", closesAt: "13:00" },
      // Stale rows left on a practitioner that uses clinic hours are never read.
      { businessId: businessA, practitionerId: clinicHoursDoctor, dayOfWeek: 1, openAllDay: true },
      { businessId: businessB, practitionerId: foreign, dayOfWeek: 1, openAllDay: true },
    ]);
    await dbs.staff.db.insert(practitionerLeave).values([
      { businessId: businessA, practitionerId: ownHoursDoctor, startsOn: "2037-11-02", endsOn: "2037-11-06", note: "Conference" },
      { businessId: businessA, practitionerId: ownHoursDoctor, startsOn: "2037-10-05", endsOn: "2037-10-05" },
      { businessId: businessA, practitionerId: clinicHoursDoctor, startsOn: "2037-10-07", endsOn: "2037-10-08" },
      { businessId: businessA, practitionerId: archived, startsOn: "2037-10-07", endsOn: "2037-10-08" },
    ]);

    const schedules = await readPractitionerSchedules(dbs.staff.db, businessA);
    expect(schedules.map((row) => row.id)).toEqual([clinicHoursDoctor, ownHoursDoctor]);
    expect(schedules[0]).toEqual({
      id: clinicHoursDoctor,
      name: "Riverside Clinic",
      title: null,
      photoMediaId: null,
      usesClinicHours: true,
      hours: [],
      leave: [{ id: expect.any(String), startsOn: "2037-10-07", endsOn: "2037-10-08", note: null }],
    });
    expect(schedules[1]).toMatchObject({ name: "Dr Arjun Rao", title: "Physiotherapist", usesClinicHours: false });
    expect(schedules[1]?.hours.map((row) => [row.dayOfWeek, row.opensAt, row.openAllDay])).toEqual([
      [0, "09:00:00", false],
      [0, "16:00:00", false],
      [2, null, true],
    ]);
    expect(schedules[1]?.leave.map((row) => row.startsOn)).toEqual(["2037-10-05", "2037-11-02"]);
  });

  it("drops leave that ended before yesterday but keeps ongoing leave and leave that ended yesterday", async () => {
    await enableAppointments(businessA);
    const doctor = await defaultPractitionerId(businessA);
    await dbs.staff.db.insert(practitionerLeave).values([
      { businessId: businessA, practitionerId: doctor, startsOn: "2020-01-01", endsOn: "2020-01-05", note: "Long past" },
      { businessId: businessA, practitionerId: doctor, startsOn: "2020-01-01", endsOn: sql`current_date - 2`, note: "Two days ago" },
      { businessId: businessA, practitionerId: doctor, startsOn: "2020-01-01", endsOn: sql`current_date - 1`, note: "Yesterday" },
      { businessId: businessA, practitionerId: doctor, startsOn: "2020-01-01", endsOn: "2099-12-31", note: "Ongoing" },
    ]);

    const [schedule] = await readPractitionerSchedules(dbs.staff.db, businessA);
    expect(schedule?.leave.map((row) => row.note).sort()).toEqual(["Ongoing", "Yesterday"]);
  });

  it("is empty for a business that never switched appointments on", async () => {
    expect(await readPractitionerSchedules(dbs.staff.db, businessA)).toEqual([]);
  });
});

describe("reassignAppointment", () => {
  let first = "";
  let second = "";

  beforeEach(async () => {
    await enableAppointments(businessA);
    await enableAppointments(businessB);
    first = await defaultPractitionerId(businessA);
    second = await addDoctor(businessA, "Dr Arjun Rao", 1);
  });

  async function bookWith(practitionerId: string, fields: BookingFields = newAppointmentInput()): Promise<AppointmentRow> {
    return bookSlot(dbs.staff.db, businessA, { ...fields, practitionerIds: [practitionerId] });
  }

  it("moves an upcoming booking to another of the clinic's practitioners", async () => {
    const booked = await bookWith(first);
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, second, NOW))).toBe("reassigned");
    const found = await as("ownerA", (tx) => findAppointment(tx, booked.id));
    expect(found?.practitionerId).toBe(second);
  });

  it("reports taken when the target already has an overlapping booking, cancelled ones aside", async () => {
    const booked = await bookWith(first);
    const overlapping = await bookWith(
      second,
      newAppointmentInput({
        patientName: "Aarav Shah",
        localStart: "09:45",
        localEnd: "10:15",
        startsAt: new Date("2037-10-01T04:15:00.000Z"),
        endsAt: new Date("2037-10-01T04:45:00.000Z"),
      }),
    );
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, second, NOW))).toBe("taken");
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.practitionerId).toBe(first);

    await as("ownerA", (tx) => transitionAppointment(tx, overlapping.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, second, NOW))).toBe("reassigned");
  });

  it("reports not_found for a cancelled, a past or another tenant's booking", async () => {
    const cancelled = await bookWith(first);
    await as("ownerA", (tx) => transitionAppointment(tx, cancelled.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    expect(await as("ownerA", (tx) => reassignAppointment(tx, cancelled.id, second, NOW))).toBe("not_found");

    const upcoming = await bookWith(first);
    expect(await as("ownerA", (tx) => reassignAppointment(tx, upcoming.id, second, AFTER_APPOINTMENT_STARTS))).toBe("not_found");

    const theirs = await book(businessB, newAppointmentInput());
    expect(await as("ownerA", (tx) => reassignAppointment(tx, theirs.id, second, NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => reassignAppointment(tx, "not-a-uuid", second, NOW))).toBe("not_found");
  });

  it("reports not_found for another tenant's, an archived, the same or a non-UUID practitioner", async () => {
    const booked = await bookWith(first);
    const foreign = await defaultPractitionerId(businessB);
    const archived = await addDoctor(businessA, "Dr Gone", 2);
    await archiveDoctor(archived);

    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, foreign, NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, archived, NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, first, NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => reassignAppointment(tx, booked.id, "not-a-uuid", NOW))).toBe("not_found");
    expect((await as("ownerA", (tx) => findAppointment(tx, booked.id)))?.practitionerId).toBe(first);
  });
});

describe("booking OTPs", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("creates and finds an OTP with its payload intact", async () => {
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
    const found = await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA });
    expect(found?.phone).toBe("+919876543210");
    expect(found?.attempts).toBe(0);
    expect(found?.verifiedAt).toBeNull();
    expect(found?.payload).toEqual(newOtpPayload());
  });

  it("returns null from findBookingOtp for a non-UUID id", async () => {
    expect(await findBookingOtp(dbs.staff.db, { otpId: "not-a-uuid", businessId: businessA })).toBeNull();
  });

  it("returns null from findBookingOtp for the wrong business", async () => {
    await enableAppointments(businessB);
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
    expect(await findBookingOtp(dbs.staff.db, { otpId, businessId: businessB })).toBeNull();
  });

  it("deletes an OTP", async () => {
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
    expect(await deleteBookingOtp(dbs.staff.db, otpId)).toBe(true);
    expect(await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA })).toBeNull();
    expect(await deleteBookingOtp(dbs.staff.db, otpId)).toBe(false);
  });

  describe("claimOtpAttempt", () => {
    it("gives exactly maxAttempts (5) successful claims out of 10 concurrent attempts", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      const results = await Promise.all(
        Array.from({ length: 10 }, () => claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })),
      );
      const successes = results.filter((result): result is { attempts: number } => result !== null);
      expect(successes).toHaveLength(MAX_OTP_ATTEMPTS);
      expect(successes.map((result) => result.attempts).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

      const found = await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA });
      expect(found?.attempts).toBe(MAX_OTP_ATTEMPTS);
    });

    it("returns null once maxAttempts is already reached", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i += 1) {
        await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW });
      }
      expect(await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBeNull();
    });

    it("returns null once the OTP has expired", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(NOW.getTime() - 1000) }));
      expect(await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBeNull();
    });

    it("returns null once the OTP is already verified", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(true);
      expect(await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBeNull();
    });

    it("returns null for the wrong business", async () => {
      await enableAppointments(businessB);
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      expect(await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessB, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBeNull();
    });

    it("returns null for a non-UUID id", async () => {
      expect(await claimOtpAttempt(dbs.staff.db, { otpId: "not-a-uuid", businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBeNull();
    });
  });

  describe("markOtpVerified", () => {
    it("verifies an OTP only once", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(true);
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(false);
    });

    it("refuses to verify an expired OTP", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(NOW.getTime() - 1000) }));
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(false);
    });

    it("refuses to verify an OTP scoped to the wrong business", async () => {
      await enableAppointments(businessB);
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessB, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(false);
      // Still verifiable through the business it actually belongs to.
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW })).toBe(true);
    });

    it("refuses to verify once attempts exceeds the given maxAttempts", async () => {
      const otpId = await createBookingOtp(dbs.staff.db, newOtpInput());
      await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW });
      await claimOtpAttempt(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: MAX_OTP_ATTEMPTS, now: NOW });
      // attempts is now 2; a caller passing a stale/lower maxAttempts is refused, one passing the real limit is not.
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: 1, now: NOW })).toBe(false);
      expect(await markOtpVerified(dbs.staff.db, { otpId, businessId: businessA, maxAttempts: 2, now: NOW })).toBe(true);
    });
  });
});

describe("purgeExpiredBookingData", () => {
  beforeEach(async () => {
    await enableAppointments(businessA);
  });

  it("deletes a booking_otps row expired more than an hour ago", async () => {
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(NOW.getTime() - 61 * 60 * 1000) }));
    const result = await purgeExpiredBookingData(dbs.staff.db, NOW);
    expect(result).toEqual({ deletedOtps: 1, deletedSmsMessages: 0 });
    expect(await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA })).toBeNull();
  });

  it("keeps a booking_otps row inside the one-hour grace window past expiry", async () => {
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(NOW.getTime() - 59 * 60 * 1000) }));
    const result = await purgeExpiredBookingData(dbs.staff.db, NOW);
    expect(result.deletedOtps).toBe(0);
    expect(await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA })).not.toBeNull();
  });

  it("keeps a booking_otps row that has not expired yet", async () => {
    const otpId = await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000) }));
    const result = await purgeExpiredBookingData(dbs.staff.db, NOW);
    expect(result.deletedOtps).toBe(0);
    expect(await findBookingOtp(dbs.staff.db, { otpId, businessId: businessA })).not.toBeNull();
  });

  it("deletes an sms_messages row older than 7 days, keeps one inside the window", async () => {
    const oldEnough = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 - 1000);
    const stillFresh = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 + 1000);
    const [oldRow] = await dbs.staff.db
      .insert(smsMessages)
      .values({ businessId: businessA, toPhone: "+919876543210", body: "old", createdAt: oldEnough })
      .returning({ id: smsMessages.id });
    const [freshRow] = await dbs.staff.db
      .insert(smsMessages)
      .values({ businessId: businessA, toPhone: "+919876543210", body: "fresh", createdAt: stillFresh })
      .returning({ id: smsMessages.id });

    const result = await purgeExpiredBookingData(dbs.staff.db, NOW);

    expect(result).toEqual({ deletedOtps: 0, deletedSmsMessages: 1 });
    const remaining = await listSmsMessages(dbs.staff.db, 10);
    expect(remaining.map((row) => row.id)).toEqual([freshRow?.id]);
    expect(remaining.map((row) => row.id)).not.toContain(oldRow?.id);
  });

  it("is a no-op, returning zero counts, when there is nothing to purge", async () => {
    // The real clock, not NOW: the SMS row is stamped by the database as it is saved.
    const now = new Date();
    await createBookingOtp(dbs.staff.db, newOtpInput({ expiresAt: new Date(now.getTime() + 10 * 60 * 1000) }));
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "111111 is your code" });
    expect(await purgeExpiredBookingData(dbs.staff.db, now)).toEqual({ deletedOtps: 0, deletedSmsMessages: 0 });
  });
});

describe("SMS outbox", () => {
  it("records and lists messages, newest first", async () => {
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "111111 is your code" });
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "222222 is your code" });
    const listed = await listSmsMessages(dbs.staff.db, 10);
    expect(listed.map((row) => row.body)).toEqual(["222222 is your code", "111111 is your code"]);
    expect(listed[0]?.transport).toBe("outbox");
  });

  it("clamps the limit to between 1 and 200", async () => {
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "111111 is your code" });
    await insertSmsMessage(dbs.staff.db, { businessId: businessA, toPhone: "+919876543210", body: "222222 is your code" });
    expect(await listSmsMessages(dbs.staff.db, 0)).toHaveLength(1);
    expect(await listSmsMessages(dbs.staff.db, -5)).toHaveLength(1);
    expect(await listSmsMessages(dbs.staff.db, 1.9)).toHaveLength(1);
    expect(await listSmsMessages(dbs.staff.db, 10_000)).toHaveLength(2);
  });

  it("breaks ties on id when several messages share the same created_at", async () => {
    // A single multi-row INSERT: created_at's DEFAULT now() is evaluated once for the whole statement, so both
    // rows land with an identical created_at. A shared created_at must still come back in one stable order across
    // calls, which only an id tiebreaker in the ORDER BY can guarantee.
    await dbs.staff.db.insert(smsMessages).values([
      { businessId: businessA, toPhone: "+919876543210", body: "first" },
      { businessId: businessA, toPhone: "+919876543210", body: "second" },
    ]);
    const first = await listSmsMessages(dbs.staff.db, 10);
    const second = await listSmsMessages(dbs.staff.db, 10);
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });
});


describe("bookSlot and a patient who already has a booking at that time", () => {
  let first = "";
  let second = "";

  beforeEach(async () => {
    await enableAppointments(businessA);
    first = await defaultPractitionerId(businessA);
    second = await addDoctor(businessA, "Dr Arjun Rao", 1);
  });

  const sameTimeOther = (fields: Partial<BookingFields>): NewAppointment => ({ ...newAppointmentInput(fields), practitionerIds: [second] });

  it("refuses the same patient at the same time with a different doctor", async () => {
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    await expect(bookSlot(dbs.staff.db, businessA, sameTimeOther({}))).rejects.toBeInstanceOf(PatientOverlapError);
    expect((await countAppointments(dbs.staff.db, businessA)).total).toBe(1);
  });

  it("refuses a partly overlapping time, and reads the name without regard to case or spaces", async () => {
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    const overlapping = sameTimeOther({
      patientName: "  PRIYA   shah ",
      localStart: "09:45",
      localEnd: "10:15",
      startsAt: new Date("2037-10-01T04:15:00.000Z"),
      endsAt: new Date("2037-10-01T04:45:00.000Z"),
    });
    await expect(bookSlot(dbs.staff.db, businessA, overlapping)).rejects.toBeInstanceOf(PatientOverlapError);
  });

  it("lets a different name on the same phone book the same time, as a parent booking two children", async () => {
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    await expect(bookSlot(dbs.staff.db, businessA, sameTimeOther({ patientName: "Aarav Shah" }))).resolves.toMatchObject({ status: "booked" });
  });

  it("lets the same patient book the slot right after, with either doctor", async () => {
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    const adjacent = sameTimeOther({
      localStart: "10:00",
      localEnd: "10:30",
      startsAt: new Date("2037-10-01T04:30:00.000Z"),
      endsAt: new Date("2037-10-01T05:00:00.000Z"),
    });
    await expect(bookSlot(dbs.staff.db, businessA, adjacent)).resolves.toMatchObject({ status: "booked" });
  });

  it("lets the same patient book again once the first booking is cancelled", async () => {
    const booked = await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    await as("ownerA", (tx) => transitionAppointment(tx, booked.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    await expect(bookSlot(dbs.staff.db, businessA, sameTimeOther({}))).resolves.toMatchObject({ status: "booked" });
  });

  it("keeps one business's patients from blocking another's", async () => {
    await enableAppointments(businessB);
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    await expect(book(businessB, newAppointmentInput())).resolves.toMatchObject({ status: "booked" });
  });

  it("lets exactly one of two concurrent bookings by the same patient for the same time win", async () => {
    const results = await Promise.allSettled([
      bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] }),
      bookSlot(dbs.staff.db, businessA, sameTimeOther({})),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await countAppointments(dbs.staff.db, businessA)).total).toBe(1);
  });

  it("answers the same question on its own, without booking", async () => {
    const person = { phone: "+919876543210", patientName: "Priya Shah" };
    const window = { startsAt: new Date("2037-10-01T04:00:00.000Z"), endsAt: new Date("2037-10-01T04:30:00.000Z") };
    expect(await personHasBookingOverlapping(dbs.staff.db, businessA, person, window)).toBe(false);
    await bookSlot(dbs.staff.db, businessA, { ...newAppointmentInput(), practitionerIds: [first] });
    expect(await personHasBookingOverlapping(dbs.staff.db, businessA, person, window)).toBe(true);
    expect(await personHasBookingOverlapping(dbs.staff.db, businessA, { ...person, patientName: "Aarav Shah" }, window)).toBe(false);
  });
});
