import { readFile } from "node:fs/promises";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookSlot, transitionAppointment, type AppointmentRow, type NewAppointment } from "./queries/appointments";
import { setBusinessModule, setBusinessTimeZone } from "./queries/business-modules";
import {
  countPatients,
  ERASED_PATIENT_NAME,
  erasePatient,
  findPatient,
  findPatientByPhone,
  listPatientAppointments,
  listPatients,
  mergePatients,
  updatePatient,
  type ListPatientsInput,
} from "./queries/patients";
import { appointments, businesses, businessMembers, patients, practitioners, users } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF_USER = "staff-1";
/** The suite's simulated clock: before every default-shaped (2037-10-01) booking, so those are "upcoming". */
const NOW = new Date("2037-09-25T10:00:00.000Z");
/** NOW's date in the business's time zone (Asia/Kolkata). */
const TODAY = "2037-09-25";

const PRIYA = "+919876543210";
const RAVI = "+919811111111";
const ANITA = "+919822222222";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function as<T>(who: "ownerA" | "ownerB", work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  const scope = who === "ownerA" ? { userId: OWNER_A, businessId: businessA } : { userId: OWNER_B, businessId: businessB };
  return withTenantScope(dbs.app.db, scope, work);
}

async function enableAppointments(businessId: string): Promise<void> {
  await setBusinessTimeZone(dbs.staff.db, businessId, "Asia/Kolkata");
  await setBusinessModule(dbs.staff.db, { businessId, module: "appointments", enabled: true, staffUserId: STAFF_USER, now: NOW });
}

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

type BookingFields = Omit<NewAppointment, "practitionerIds">;

/** A 30-minute booking on `localDate` at 09:30 IST (04:00 UTC) unless overridden; `startsAt` follows `localDate`. */
function booking(localDate: string, overrides: Partial<BookingFields> = {}): BookingFields {
  const startsAt = new Date(`${localDate}T04:00:00.000Z`);
  return {
    patientName: "Priya Shah",
    phone: PRIYA,
    serviceId: null,
    serviceName: "Consultation",
    localDate,
    localStart: "09:30",
    localEnd: "10:00",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
    ...overrides,
  };
}

async function book(businessId: string, fields: BookingFields): Promise<AppointmentRow> {
  return bookSlot(dbs.staff.db, businessId, { ...fields, practitionerIds: [await defaultPractitionerId(businessId)] });
}

/** A booking that started `hoursAgo` hours ago by the real clock, which is what the guard trigger's now() compares
 * against; tests with several give each its own hour, since one doctor cannot have two bookings at one instant. */
function startedBooking(overrides: Partial<BookingFields> = {}, hoursAgo = 1): BookingFields {
  const startsAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return { ...booking("2037-09-24"), startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000), ...overrides };
}

async function markAttended(id: string): Promise<void> {
  const done = await as("ownerA", (tx) => transitionAppointment(tx, id, { action: "done" }, OWNER_A, new Date()));
  if (done === null) throw new Error(`Appointment ${id} could not be marked done`);
}

async function patientIdOf(appointment: AppointmentRow): Promise<string> {
  if (appointment.patientId === null) throw new Error(`Appointment ${appointment.id} has no patient`);
  return appointment.patientId;
}

function listInput(overrides: Partial<ListPatientsInput> = {}): ListPatientsInput {
  return { filter: "all", search: "", now: NOW, today: TODAY, limit: 200, offset: 0, ...overrides };
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
    { id: OWNER_B, name: "Ben Ortiz", email: "ben@example.com" },
    { id: STAFF_USER, name: "Sam Staff", email: "sam@firstfold.test" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-clinic", name: "Riverside Clinic" },
      { slug: "harbour-clinic", name: "Harbour Clinic" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "riverside-clinic")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "harbour-clinic")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  await enableAppointments(businessA);
  await enableAppointments(businessB);
});

describe("appointments_link_patient", () => {
  it("creates a patient from a first booking, named and numbered from it", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const patient = await as("ownerA", async (tx) => findPatient(tx, await patientIdOf(booked)));
    expect(patient).toMatchObject({ name: "Priya Shah", phone: PRIYA, altPhone: null, tags: [] });
  });

  it("links a later booking from the same number to the same patient without renaming them", async () => {
    const first = await book(businessA, booking("2037-10-01"));
    const second = await book(businessA, booking("2037-10-02", { patientName: "P. Shah" }));
    expect(second.patientId).toBe(first.patientId);
    expect(second.patientName).toBe("P. Shah");
    expect((await as("ownerA", (tx) => findPatient(tx, first.patientId ?? "")))?.name).toBe("Priya Shah");
    expect(await as("ownerA", (tx) => countPatients(tx))).toBe(1);
  });

  it("links a booking from a patient's second phone to that patient", async () => {
    const first = await book(businessA, booking("2037-10-01"));
    await dbs.staff.db.update(patients).set({ altPhone: RAVI }).where(eq(patients.id, first.patientId ?? ""));
    const second = await book(businessA, booking("2037-10-02", { patientName: "Priya (office)", phone: RAVI }));
    expect(second.patientId).toBe(first.patientId);
    expect(await as("ownerA", (tx) => countPatients(tx))).toBe(1);
  });

  it("keeps each business's patients apart even for the same number", async () => {
    const inA = await book(businessA, booking("2037-10-01"));
    const inB = await book(businessB, booking("2037-10-01"));
    expect(inA.patientId).not.toBe(inB.patientId);
  });

  it("gives two concurrent first bookings from one number a single patient", async () => {
    const second = await dbs.staff.db
      .insert(practitioners)
      .values({ businessId: businessA, name: "Dr Second", position: 1 })
      .returning({ id: practitioners.id });
    const doctors = [await defaultPractitionerId(businessA), second[0]?.id ?? ""];
    for (const [round, phone] of ["+919800000001", "+919800000002", "+919800000003"].entries()) {
      const localDate = `2037-10-0${String(round + 1)}`;
      const startsAt = new Date(`${localDate}T04:00:00.000Z`);
      const rows = await Promise.all(
        doctors.map((practitionerId) =>
          dbs.staff.db
            .insert(appointments)
            .values({
              businessId: businessA,
              practitionerId,
              patientName: "Walk-in",
              phone,
              localDate,
              localStart: "09:30",
              localEnd: "10:00",
              startsAt,
              endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
            })
            .returning({ patientId: appointments.patientId }),
        ),
      );
      expect(rows[0]?.[0]?.patientId).not.toBeNull();
      expect(rows[0]?.[0]?.patientId).toBe(rows[1]?.[0]?.patientId);
    }
    expect(await as("ownerA", (tx) => countPatients(tx))).toBe(3);
  });

  it("refuses a booking with a phone but, forced through, no patient, and one with a patient but no phone", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const noPhone = await captureErrorText(
      dbs.staff.db.update(appointments).set({ phone: null }).where(eq(appointments.id, booked.id)),
    );
    expect(noPhone).toMatch(/appointments_patient_link_check/);
    const noPatient = await captureErrorText(
      dbs.staff.db.update(appointments).set({ patientId: null }).where(eq(appointments.id, booked.id)),
    );
    expect(noPatient).toMatch(/appointments_patient_link_check/);
  });

  it("is not SECURITY DEFINER and pins its search_path", async () => {
    const rows = await dbs.owner.db.execute<{ prosecdef: boolean; proconfig: string[] | null }>(
      sql`select prosecdef, proconfig from pg_proc where proname = 'appointments_link_patient'`,
    );
    expect(rows.rows[0]?.prosecdef).toBe(false);
    expect(rows.rows[0]?.proconfig).toContain("search_path=pg_catalog, public");
  });
});

describe("0050 backfill", () => {
  const MIGRATION = new URL("../migrations/0050_clinic_patients.sql", import.meta.url);

  async function statementFrom(marker: string): Promise<string> {
    const migration = await readFile(MIGRATION, "utf8");
    const statement = migration.split("--> statement-breakpoint").find((part) => part.includes(marker));
    if (statement === undefined) throw new Error(`0050 no longer contains "${marker}".`);
    return statement;
  }

  /** Thrown to roll the owner transaction back once the assertions have run. */
  class RollBack extends Error {}

  it("makes one patient per business and phone, named from the newest booking, first seen at the oldest, and links every row", async () => {
    const practitionerA = await defaultPractitionerId(businessA);
    const practitionerB = await defaultPractitionerId(businessB);
    const [insertPatients, linkAppointments, addCheck] = await Promise.all([
      statementFrom('INSERT INTO "patients"'),
      statementFrom('UPDATE "appointments" a SET "patient_id"'),
      statementFrom('ADD CONSTRAINT "appointments_patient_link_check"'),
    ]);

    function row(
      businessId: string,
      practitionerId: string,
      phone: string,
      patientName: string,
      day: number,
      createdAt: string,
    ): typeof appointments.$inferInsert {
      const startsAt = new Date(`2037-08-${String(day).padStart(2, "0")}T04:00:00.000Z`);
      return {
        businessId,
        practitionerId,
        patientName,
        phone,
        localDate: `2037-08-${String(day).padStart(2, "0")}`,
        localStart: "09:30",
        localEnd: "10:00",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        createdAt: new Date(createdAt),
      };
    }

    const outcome = await dbs.owner.db
      .transaction(async (tx) => {
        // The state 0050 found: bookings with a phone and no patient, no link trigger and no link CHECK yet.
        await tx.execute(sql`ALTER TABLE appointments DROP CONSTRAINT appointments_patient_link_check`);
        await tx.execute(sql`ALTER TABLE appointments DISABLE TRIGGER appointments_link_patient`);
        await tx.insert(appointments).values([
          row(businessA, practitionerA, PRIYA, "priya", 1, "2037-07-01T00:00:00Z"),
          row(businessA, practitionerA, PRIYA, "Priya Shah", 2, "2037-07-20T00:00:00Z"),
          row(businessA, practitionerA, RAVI, "Ravi Kumar", 3, "2037-07-05T00:00:00Z"),
          row(businessB, practitionerB, PRIYA, "Priya at B", 1, "2037-07-10T00:00:00Z"),
        ]);

        await tx.execute(sql.raw(insertPatients));
        await tx.execute(sql.raw(linkAppointments));
        await tx.execute(sql.raw(addCheck));

        const register = await tx
          .select({ businessId: patients.businessId, name: patients.name, phone: patients.phone, createdAt: patients.createdAt })
          .from(patients)
          .orderBy(asc(patients.createdAt));
        const unlinked = await tx.execute<{ count: number }>(
          sql`select count(*)::int as count from appointments where patient_id is null`,
        );
        const mislinked = await tx.execute<{ count: number }>(
          sql`select count(*)::int as count from appointments a join patients p on p.id = a.patient_id
              where p.business_id <> a.business_id or p.phone <> a.phone`,
        );
        throw new RollBack(JSON.stringify({ register, unlinked: unlinked.rows[0]?.count, mislinked: mislinked.rows[0]?.count }));
      })
      .catch((error: unknown) => {
        if (error instanceof RollBack) return JSON.parse(error.message) as unknown;
        throw error;
      });

    expect(outcome).toEqual({
      register: [
        { businessId: businessA, name: "Priya Shah", phone: PRIYA, createdAt: "2037-07-01T00:00:00.000Z" },
        { businessId: businessA, name: "Ravi Kumar", phone: RAVI, createdAt: "2037-07-05T00:00:00.000Z" },
        { businessId: businessB, name: "Priya at B", phone: PRIYA, createdAt: "2037-07-10T00:00:00.000Z" },
      ],
      unlinked: 0,
      mislinked: 0,
    });

    // Rolled back: the trigger and the CHECK are back as the migration left them.
    const booked = await book(businessA, booking("2037-10-01"));
    expect(booked.patientId).not.toBeNull();
  });
});

describe("patients: grants and row-level security", () => {
  it("shows a business only its own patients", async () => {
    const inA = await book(businessA, booking("2037-10-01"));
    await book(businessB, booking("2037-10-01", { phone: RAVI, patientName: "Ravi Kumar" }));

    expect(await as("ownerB", (tx) => findPatient(tx, inA.patientId ?? ""))).toBeNull();
    expect(await as("ownerB", (tx) => findPatientByPhone(tx, PRIYA))).toBeNull();
    expect(await as("ownerB", (tx) => listPatientAppointments(tx, inA.patientId ?? ""))).toEqual([]);
    const listed = await as("ownerB", (tx) => listPatients(tx, listInput()));
    expect(listed.rows.map((row) => row.phone)).toEqual([RAVI]);
    expect(await as("ownerB", (tx) => updatePatient(tx, inA.patientId ?? "", { name: "Hijack", altPhone: null, tags: [] }, NOW))).toBe(
      "not_found",
    );
    expect(await as("ownerB", (tx) => erasePatient(tx, inA.patientId ?? "", NOW))).toBe("not_found");
  });

  it("hides and freezes the register once the module is switched off", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    await setBusinessModule(dbs.staff.db, { businessId: businessA, module: "appointments", enabled: false, staffUserId: STAFF_USER, now: NOW });

    expect(await as("ownerA", (tx) => countPatients(tx))).toBe(0);
    expect(await as("ownerA", (tx) => listPatients(tx, listInput()))).toEqual({ total: 0, rows: [] });
    expect(await as("ownerA", (tx) => updatePatient(tx, booked.patientId ?? "", { name: "X", altPhone: null, tags: [] }, NOW))).toBe(
      "not_found",
    );
    expect(await as("ownerA", (tx) => erasePatient(tx, booked.patientId ?? "", NOW))).toBe("not_found");
  });

  it("refuses firstfold_app inserting a patient", async () => {
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.insert(patients).values({ businessId: businessA, name: "Sneaky", phone: PRIYA })),
    );
    expect(message).toMatch(/permission denied for table patients/);
  });

  it("refuses firstfold_app changing a patient's phone or business", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const phoneMessage = await captureErrorText(
      as("ownerA", (tx) => tx.update(patients).set({ phone: RAVI }).where(eq(patients.id, booked.patientId ?? ""))),
    );
    expect(phoneMessage).toMatch(/permission denied for table patients/);
    const businessMessage = await captureErrorText(
      as("ownerA", (tx) => tx.update(patients).set({ businessId: businessB }).where(eq(patients.id, booked.patientId ?? ""))),
    );
    expect(businessMessage).toMatch(/permission denied for table patients/);
  });

  it("refuses more than five tags at the database", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        updatePatient(tx, booked.patientId ?? "", { name: "Priya Shah", altPhone: null, tags: ["a", "b", "c", "d", "e", "f"] }, NOW),
      ),
    );
    expect(message).toMatch(/patients_tags_check/);
  });
});

describe("appointments guard: merge and erase shapes", () => {
  it("refuses a merge that also rewrites the booking's name", async () => {
    const priya = await book(businessA, booking("2037-10-01"));
    const ravi = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ patientId: ravi.patientId, patientName: "Ravi Kumar" }).where(eq(appointments.id, priya.id)),
      ),
    );
    expect(message).toMatch(/(firstfold_app|webfold_app) may only change a booking's patient details by merging or erasing a patient/);
  });

  it("refuses a merge that also cancels the booking", async () => {
    const priya = await book(businessA, booking("2037-10-01"));
    const ravi = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx
          .update(appointments)
          .set({ patientId: ravi.patientId, status: "cancelled", cancelledAt: NOW })
          .where(eq(appointments.id, priya.id)),
      ),
    );
    expect(message).toMatch(/(firstfold_app|webfold_app) may only change a booking's patient details by merging or erasing a patient/);
  });

  it("refuses erasing an upcoming booked appointment, even bypassing erasePatient", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx
          .update(appointments)
          .set({ patientId: null, patientName: ERASED_PATIENT_NAME, phone: null, email: null, patientNote: null, clinicNote: null })
          .where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(firstfold_app|webfold_app) may only change a booking's patient details by merging or erasing a patient/);
  });

  it("refuses a partial erase that leaves the phone behind", async () => {
    const booked = await book(businessA, startedBooking());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.update(appointments).set({ patientId: null, patientName: ERASED_PATIENT_NAME }).where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(firstfold_app|webfold_app) may only change a booking's patient details by merging or erasing a patient/);
  });

  it("refuses an erase under any other name", async () => {
    const booked = await book(businessA, startedBooking());
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx
          .update(appointments)
          .set({ patientId: null, patientName: "Someone", phone: null, email: null, patientNote: null, clinicNote: null })
          .where(eq(appointments.id, booked.id)),
      ),
    );
    expect(message).toMatch(/(firstfold_app|webfold_app) may only change a booking's patient details by merging or erasing a patient/);
  });
});

describe("listPatients and countPatients", () => {
  it("lists every patient by name with visits, no-shows, last and next visit", async () => {
    const priyaPast = await book(businessA, startedBooking());
    await markAttended(priyaPast.id);
    await book(businessA, booking("2037-10-03"));
    await book(businessA, booking("2037-10-01"));
    const raviPast = await book(businessA, startedBooking({ phone: RAVI, patientName: "Ravi Kumar", localDate: "2037-09-20" }, 2));
    const raviMissed = await as("ownerA", (tx) =>
      transitionAppointment(tx, raviPast.id, { action: "no_show" }, OWNER_A, new Date()),
    );
    expect(raviMissed?.status).toBe("no_show");
    await book(businessA, booking("2037-10-04", { phone: ANITA, patientName: "anita Rao" }));

    const listed = await as("ownerA", (tx) => listPatients(tx, listInput()));
    expect(listed.total).toBe(3);
    expect(listed.rows.map((row) => row.name)).toEqual(["anita Rao", "Priya Shah", "Ravi Kumar"]);
    expect(listed.rows[1]).toMatchObject({
      phone: PRIYA,
      visits: 1,
      noShows: 0,
      lastVisitDate: "2037-09-24",
      nextLocalDate: "2037-10-01",
      nextLocalStart: "09:30",
    });
    expect(listed.rows[1]?.nextStartsAt).toEqual(new Date("2037-10-01T04:00:00.000Z"));
    expect(listed.rows[2]).toMatchObject({ visits: 0, noShows: 1, lastVisitDate: null, nextStartsAt: null, nextLocalDate: null, nextLocalStart: null });
    expect(await as("ownerA", (tx) => countPatients(tx))).toBe(3);
  });

  it("filters upcoming, soonest next visit first", async () => {
    await book(businessA, booking("2037-10-05"));
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await book(businessA, startedBooking({ phone: ANITA, patientName: "Anita Rao" }));

    // The real clock, not NOW: Anita's booking started an hour ago by the real clock, which is after NOW.
    const listed = await as("ownerA", (tx) => listPatients(tx, listInput({ filter: "upcoming", now: new Date() })));
    expect(listed.rows.map((row) => row.name)).toEqual(["Ravi Kumar", "Priya Shah"]);
    expect(listed.total).toBe(2);
  });

  it("filters new this month in the business's calendar", async () => {
    const priya = await book(businessA, booking("2037-10-01"));
    const ravi = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    const anita = await book(businessA, booking("2037-10-03", { phone: ANITA, patientName: "Anita Rao" }));
    // 2037-08-31T20:00Z is already 1 September in Kolkata; 2037-08-31T18:00Z is still 31 August there.
    await dbs.staff.db.update(patients).set({ createdAt: new Date("2037-08-31T20:00:00Z") }).where(eq(patients.id, priya.patientId ?? ""));
    await dbs.staff.db.update(patients).set({ createdAt: new Date("2037-08-31T18:00:00Z") }).where(eq(patients.id, ravi.patientId ?? ""));
    await dbs.staff.db.update(patients).set({ createdAt: new Date("2037-09-20T00:00:00Z") }).where(eq(patients.id, anita.patientId ?? ""));

    const listed = await as("ownerA", (tx) => listPatients(tx, listInput({ filter: "new" })));
    expect(listed.rows.map((row) => row.name)).toEqual(["Anita Rao", "Priya Shah"]);
  });

  it("filters patients not seen in six months with nothing booked", async () => {
    const lapsedVisit = await book(businessA, startedBooking({ localDate: "2037-03-01" }));
    await markAttended(lapsedVisit.id);
    const returning = await book(businessA, startedBooking({ phone: RAVI, patientName: "Ravi Kumar", localDate: "2037-02-01" }, 2));
    await markAttended(returning.id);
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    const recent = await book(businessA, startedBooking({ phone: ANITA, patientName: "Anita Rao", localDate: "2037-04-01" }, 3));
    await markAttended(recent.id);

    const listed = await as("ownerA", (tx) => listPatients(tx, listInput({ filter: "lapsed" })));
    expect(listed.rows.map((row) => row.name)).toEqual(["Priya Shah"]);
  });

  it("searches names case-insensitively and phone digits anywhere, treating % and _ literally", async () => {
    await book(businessA, booking("2037-10-01"));
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi 100% Kumar" }));
    const anita = await book(businessA, booking("2037-10-03", { phone: ANITA, patientName: "Anita_Rao" }));
    await dbs.staff.db.update(patients).set({ altPhone: "+14155550123" }).where(eq(patients.id, anita.patientId ?? ""));

    const names = async (search: string): Promise<string[]> =>
      (await as("ownerA", (tx) => listPatients(tx, listInput({ search })))).rows.map((row) => row.name);
    expect(await names("  PRIYA ")).toEqual(["Priya Shah"]);
    expect(await names("100%")).toEqual(["Ravi 100% Kumar"]);
    expect(await names("%")).toEqual(["Ravi 100% Kumar"]);
    expect(await names("a_r")).toEqual(["Anita_Rao"]);
    expect(await names("98765")).toEqual(["Priya Shah"]);
    expect(await names("98 111")).toEqual(["Ravi 100% Kumar"]);
    expect(await names("555 0123")).toEqual(["Anita_Rao"]);
    expect(await names("98")).toEqual([]);
  });

  it("caps the rows at the limit but reports the full total", async () => {
    await book(businessA, booking("2037-10-01"));
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await book(businessA, booking("2037-10-03", { phone: ANITA, patientName: "Anita Rao" }));

    const listed = await as("ownerA", (tx) => listPatients(tx, listInput({ limit: 2 })));
    expect(listed.total).toBe(3);
    expect(listed.rows.map((row) => row.name)).toEqual(["Anita Rao", "Priya Shah"]);
    expect((await as("ownerA", (tx) => listPatients(tx, listInput({ limit: 0 })))).rows).toHaveLength(1);
  });

  it("pages with offset in the same order, without skipping or repeating anyone", async () => {
    await book(businessA, booking("2037-10-01"));
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await book(businessA, booking("2037-10-03", { phone: ANITA, patientName: "Anita Rao" }));

    const page = (offset: number): Promise<{ readonly total: number; readonly names: readonly string[] }> =>
      as("ownerA", async (tx) => {
        const listed = await listPatients(tx, listInput({ limit: 2, offset }));
        return { total: listed.total, names: listed.rows.map((row) => row.name) };
      });

    expect(await page(0)).toEqual({ total: 3, names: ["Anita Rao", "Priya Shah"] });
    expect(await page(2)).toEqual({ total: 3, names: ["Ravi Kumar"] });
    // Past the end: no rows, so the window total is 0 too -- the page treats that as "no such page".
    expect(await page(3)).toEqual({ total: 0, names: [] });
    expect(await page(-5)).toEqual(await page(0));
  });
});

describe("findPatient, findPatientByPhone, listPatientAppointments", () => {
  it("finds a patient by id and returns null for a malformed or unknown id", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    expect((await as("ownerA", (tx) => findPatient(tx, booked.patientId ?? "")))?.phone).toBe(PRIYA);
    expect(await as("ownerA", (tx) => findPatient(tx, "not-a-uuid"))).toBeNull();
    expect(await as("ownerA", (tx) => findPatient(tx, "01a0c2a2-a39c-781d-a454-b53a4f5d0000"))).toBeNull();
  });

  it("finds by phone or second phone, preferring the patient whose main number it is", async () => {
    const priya = await book(businessA, booking("2037-10-01"));
    const ravi = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await dbs.staff.db.update(patients).set({ altPhone: ANITA }).where(eq(patients.id, ravi.patientId ?? ""));
    // A stale second phone equal to another patient's main number, which only staff could leave behind.
    await dbs.staff.db.update(patients).set({ altPhone: PRIYA }).where(eq(patients.id, ravi.patientId ?? ""));

    expect((await as("ownerA", (tx) => findPatientByPhone(tx, PRIYA)))?.id).toBe(priya.patientId);
    await dbs.staff.db.update(patients).set({ altPhone: ANITA }).where(eq(patients.id, ravi.patientId ?? ""));
    expect((await as("ownerA", (tx) => findPatientByPhone(tx, ANITA)))?.id).toBe(ravi.patientId);
    expect(await as("ownerA", (tx) => findPatientByPhone(tx, "+919899999999"))).toBeNull();
  });

  it("lists a patient's bookings newest first, whatever their outcome", async () => {
    const past = await book(businessA, startedBooking());
    await markAttended(past.id);
    const later = await book(businessA, booking("2037-10-05"));
    const sooner = await book(businessA, booking("2037-10-01"));
    await as("ownerA", (tx) => transitionAppointment(tx, sooner.id, { action: "cancel", reason: null }, OWNER_A, NOW));
    await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));

    const history = await as("ownerA", (tx) => listPatientAppointments(tx, past.patientId ?? ""));
    expect(history.map((row) => [row.id, row.status])).toEqual([
      [later.id, "booked"],
      [sooner.id, "cancelled"],
      [past.id, "done"],
    ]);
    expect(await as("ownerA", (tx) => listPatientAppointments(tx, "not-a-uuid"))).toEqual([]);
  });
});

describe("updatePatient", () => {
  it("saves the name, second phone and tags", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    const id = booked.patientId ?? "";
    const later = new Date(NOW.getTime() + 60_000);
    expect(await as("ownerA", (tx) => updatePatient(tx, id, { name: "Priya S.", altPhone: RAVI, tags: ["VIP", "Insurance"] }, later))).toBe(
      "updated",
    );
    expect(await as("ownerA", (tx) => findPatient(tx, id))).toMatchObject({
      name: "Priya S.",
      phone: PRIYA,
      altPhone: RAVI,
      tags: ["VIP", "Insurance"],
      updatedAt: later,
    });

    expect(await as("ownerA", (tx) => updatePatient(tx, id, { name: "Priya S.", altPhone: null, tags: [] }, later))).toBe("updated");
    expect(await as("ownerA", (tx) => findPatient(tx, id))).toMatchObject({ altPhone: null, tags: [] });
  });

  it("refuses a second phone that is already another patient's phone or second phone, or their own phone", async () => {
    const priya = await book(businessA, booking("2037-10-01"));
    const ravi = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await as("ownerA", (tx) => updatePatient(tx, ravi.patientId ?? "", { name: "Ravi Kumar", altPhone: ANITA, tags: [] }, NOW));

    const edit = (altPhone: string) => as("ownerA", (tx) => updatePatient(tx, priya.patientId ?? "", { name: "Priya Shah", altPhone, tags: [] }, NOW));
    expect(await edit(RAVI)).toBe("phone_in_use");
    expect(await edit(ANITA)).toBe("phone_in_use");
    expect(await edit(PRIYA)).toBe("phone_in_use");
    // Another business holding the number does not count.
    await book(businessB, booking("2037-10-01", { phone: "+919833333333" }));
    expect(await edit("+919833333333")).toBe("updated");
  });

  it("reports not_found for a malformed or unknown id", async () => {
    expect(await as("ownerA", (tx) => updatePatient(tx, "nope", { name: "X", altPhone: null, tags: [] }, NOW))).toBe("not_found");
    expect(
      await as("ownerA", (tx) => updatePatient(tx, "01a0c2a2-a39c-781d-a454-b53a4f5d0000", { name: "X", altPhone: null, tags: [] }, NOW)),
    ).toBe("not_found");
  });
});

describe("mergePatients", () => {
  it("moves every booking to the kept patient, keeps their snapshots, adopts the phone and merges tags", async () => {
    const keep = await book(businessA, booking("2037-10-01"));
    const removeFirst = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "P Shah (work)" }));
    const removeSecond = await book(businessA, startedBooking({ phone: RAVI, patientName: "P Shah (work)" }));
    await markAttended(removeSecond.id);
    const keepId = keep.patientId ?? "";
    const removeId = removeFirst.patientId ?? "";
    await dbs.staff.db.update(patients).set({ tags: ["VIP", "Diabetic clinic"] }).where(eq(patients.id, keepId));
    await dbs.staff.db.update(patients).set({ tags: ["vip", "Insurance", "Morning", "Walk-in", "Senior"] }).where(eq(patients.id, removeId));

    expect(await as("ownerA", (tx) => mergePatients(tx, keepId, removeId, NOW))).toBe("merged");

    expect(await as("ownerA", (tx) => findPatient(tx, removeId))).toBeNull();
    expect(await as("ownerA", (tx) => findPatient(tx, keepId))).toMatchObject({
      name: "Priya Shah",
      phone: PRIYA,
      altPhone: RAVI,
      tags: ["VIP", "Diabetic clinic", "Insurance", "Morning", "Walk-in"],
    });
    const history = await as("ownerA", (tx) => listPatientAppointments(tx, keepId));
    expect(history.map((row) => row.id).sort()).toEqual([keep.id, removeFirst.id, removeSecond.id].sort());
    const [moved] = await dbs.staff.db.select().from(appointments).where(eq(appointments.id, removeFirst.id));
    expect(moved).toMatchObject({ patientId: keepId, patientName: "P Shah (work)", phone: RAVI });
    // A later booking from the merged-away number lands on the kept patient.
    const next = await book(businessA, booking("2037-10-06", { phone: RAVI }));
    expect(next.patientId).toBe(keepId);
  });

  it("keeps an existing second phone rather than overwriting it", async () => {
    const keep = await book(businessA, booking("2037-10-01"));
    const remove = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    await as("ownerA", (tx) => updatePatient(tx, keep.patientId ?? "", { name: "Priya Shah", altPhone: ANITA, tags: [] }, NOW));

    expect(await as("ownerA", (tx) => mergePatients(tx, keep.patientId ?? "", remove.patientId ?? "", NOW))).toBe("merged");
    expect((await as("ownerA", (tx) => findPatient(tx, keep.patientId ?? "")))?.altPhone).toBe(ANITA);
  });

  it("reports same for one patient and not_found for a missing, foreign or malformed one", async () => {
    const keep = await book(businessA, booking("2037-10-01"));
    const foreign = await book(businessB, booking("2037-10-01", { phone: RAVI }));
    const keepId = keep.patientId ?? "";
    expect(await as("ownerA", (tx) => mergePatients(tx, keepId, keepId, NOW))).toBe("same");
    expect(await as("ownerA", (tx) => mergePatients(tx, keepId, foreign.patientId ?? "", NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => mergePatients(tx, keepId, "01a0c2a2-a39c-781d-a454-b53a4f5d0000", NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => mergePatients(tx, "nope", keepId, NOW))).toBe("not_found");
    expect(await dbs.staff.db.select().from(patients).where(eq(patients.id, foreign.patientId ?? ""))).toHaveLength(1);
  });
});

describe("erasePatient", () => {
  it("refuses while the patient has an upcoming booked appointment", async () => {
    const booked = await book(businessA, booking("2037-10-01"));
    expect(await as("ownerA", (tx) => erasePatient(tx, booked.patientId ?? "", NOW))).toBe("has_upcoming");
    expect(await as("ownerA", (tx) => findPatient(tx, booked.patientId ?? ""))).not.toBeNull();
  });

  it("anonymises every booking, keeps the slots and deletes the patient", async () => {
    const attended = await book(businessA, startedBooking());
    await markAttended(attended.id);
    const cancelled = await book(businessA, booking("2037-10-01"));
    await as("ownerA", (tx) => transitionAppointment(tx, cancelled.id, { action: "cancel", reason: "Travelling" }, OWNER_A, NOW));
    await dbs.staff.db
      .update(appointments)
      .set({ email: "priya@example.com", patientNote: "Knee pain", clinicNote: "Bring X-rays" })
      .where(eq(appointments.id, attended.id));
    const other = await book(businessA, booking("2037-10-02", { phone: RAVI, patientName: "Ravi Kumar" }));
    const patientId = attended.patientId ?? "";

    expect(await as("ownerA", (tx) => erasePatient(tx, patientId, new Date()))).toBe("erased");

    expect(await as("ownerA", (tx) => findPatient(tx, patientId))).toBeNull();
    const rows = await dbs.staff.db.select().from(appointments).where(eq(appointments.businessId, businessA)).orderBy(asc(appointments.startsAt));
    const erased = rows.filter((row) => row.id !== other.id);
    expect(erased).toHaveLength(2);
    for (const row of erased) {
      expect(row).toMatchObject({
        patientId: null,
        patientName: ERASED_PATIENT_NAME,
        phone: null,
        email: null,
        patientNote: null,
        clinicNote: null,
      });
    }
    expect(erased.map((row) => row.status).sort()).toEqual(["cancelled", "done"]);
    expect(rows.find((row) => row.id === other.id)).toMatchObject({ patientName: "Ravi Kumar", phone: RAVI });
    const found = await as("ownerA", (tx) => listPatients(tx, listInput()));
    expect(found.rows.map((row) => row.name)).toEqual(["Ravi Kumar"]);
  });

  it("reports not_found for a malformed, unknown or foreign patient", async () => {
    const foreign = await book(businessB, booking("2037-10-01"));
    expect(await as("ownerA", (tx) => erasePatient(tx, "nope", NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => erasePatient(tx, "01a0c2a2-a39c-781d-a454-b53a4f5d0000", NOW))).toBe("not_found");
    expect(await as("ownerA", (tx) => erasePatient(tx, foreign.patientId ?? "", NOW))).toBe("not_found");
  });
});
