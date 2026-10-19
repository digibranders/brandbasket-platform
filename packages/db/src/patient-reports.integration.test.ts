import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setBusinessModule, setBusinessTimeZone } from "./queries/business-modules";
import { InvalidPatientReportInputError, readPatientReport, type PatientReport, type PatientReportInput } from "./queries/patient-reports";
import { appointments, businesses, businessMembers, patients, practitioners, users, type AppointmentSource, type AppointmentStatus } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF_USER = "staff-1";
const NOW = new Date("2026-09-29T10:00:00.000Z");
const TIME_ZONE = "Asia/Kolkata";
/** Asia/Kolkata is UTC+05:30 all year. */
const IST_OFFSET_MINUTES = 330;

const PRIYA = "+919876543210";
const RAVI = "+919811111111";
const ANITA = "+919822222222";
const VIKRAM = "+919833333333";
const MEERA = "+919844444444";
const KIRAN = "+919855555555";
const LATE = "+919866666666";

/** "This month" on 2026-09-29. */
const SEPTEMBER: PatientReportInput = { from: "2026-09-01", to: "2026-09-29", monthsEndingAt: "2026-09-29", timeZone: TIME_ZONE };

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let doctorA = "";
let doctorMehta = "";
let doctorOld = "";
let doctorGone = "";

function reportAs(who: "ownerA" | "ownerB", input: PatientReportInput = SEPTEMBER): Promise<PatientReport> {
  const scope = who === "ownerA" ? { userId: OWNER_A, businessId: businessA } : { userId: OWNER_B, businessId: businessB };
  return withTenantScope(dbs.app.db, scope, (tx) => readPatientReport(tx, input));
}

async function enableAppointments(businessId: string): Promise<void> {
  await setBusinessTimeZone(dbs.staff.db, businessId, TIME_ZONE);
  await setBusinessModule(dbs.staff.db, { businessId, module: "appointments", enabled: true, staffUserId: STAFF_USER, now: NOW });
}

async function firstPractitioner(businessId: string): Promise<string> {
  const [row] = await dbs.staff.db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.businessId, businessId))
    .limit(1);
  if (row === undefined) throw new Error(`Business ${businessId} has no practitioner; switch appointments on first`);
  return row.id;
}

async function addPractitioner(businessId: string, name: string, position: number): Promise<string> {
  const [row] = await dbs.staff.db.insert(practitioners).values({ businessId, name, position }).returning({ id: practitioners.id });
  if (row === undefined) throw new Error(`Could not add practitioner ${name}`);
  return row.id;
}

interface Seed {
  readonly businessId?: string;
  readonly practitionerId?: string;
  readonly name: string;
  readonly phone: string;
  readonly localDate: string;
  /** "HH:MM" in Asia/Kolkata. */
  readonly localStart: string;
  readonly status?: AppointmentStatus;
  readonly source?: AppointmentSource;
}

/** Inserts a 30-minute booking straight on the staff connection, already in its final status: the guard trigger
 * only polices bb_app, and the report reads status, not how it got there. The link trigger still creates or
 * finds the patient by phone. */
async function seed(fields: Seed): Promise<void> {
  const [hour, minute] = fields.localStart.split(":").map(Number) as [number, number];
  const startsAt = new Date(Date.parse(`${fields.localDate}T00:00:00.000Z`) + (hour * 60 + minute - IST_OFFSET_MINUTES) * 60_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const status = fields.status ?? "booked";
  await dbs.staff.db.insert(appointments).values({
    businessId: fields.businessId ?? businessA,
    practitionerId: fields.practitionerId ?? doctorA,
    patientName: fields.name,
    phone: fields.phone,
    serviceName: "Consultation",
    localDate: fields.localDate,
    localStart: fields.localStart,
    localEnd: `${String(minute === 30 ? hour + 1 : hour).padStart(2, "0")}:${minute === 30 ? "00" : "30"}`,
    startsAt,
    endsAt,
    status,
    source: fields.source ?? "online",
    doneAt: status === "done" ? endsAt : null,
    noShowAt: status === "no_show" ? endsAt : null,
    cancelledAt: status === "cancelled" ? startsAt : null,
  });
}

async function setCreatedAt(businessId: string, phone: string, createdAt: string): Promise<void> {
  const updated = await dbs.staff.db
    .update(patients)
    .set({ createdAt: new Date(createdAt) })
    .where(and(eq(patients.businessId, businessId), eq(patients.phone, phone)))
    .returning({ id: patients.id });
  if (updated.length !== 1) throw new Error(`No patient ${phone} in ${businessId}`);
}

/**
 * The fixture every expectation below is worked out from. Range = September 2026 (01..29).
 *
 * In range: Priya booked Mon 09-07 09:30 (online, Dr A); Ravi done Tue 09-08 10:00 (online, Dr A) and cancelled
 * Wed 09-09 11:00; Anita no-show Mon 09-14 09:00 (clinic, Dr Mehta); Meera done Tue 09-15 17:30 (clinic, Dr Old,
 * archived since); Vikram cancelled Sun 09-20 12:00.
 * Before range: Priya done 2025-10-01 and 2026-08-10; Meera done 2026-05-02; Vikram done 2026-06-15; Anita no-show
 * 2026-07-01; a done 2025-09-15 just outside the 12-month window. After range: done 10-02, Kiran and Late booked.
 */
async function seedClinic(): Promise<void> {
  doctorMehta = await addPractitioner(businessA, "Dr Mehta", 1);
  doctorOld = await addPractitioner(businessA, "Dr Old", 2);
  doctorGone = await addPractitioner(businessA, "Dr Gone", 3);

  await seed({ name: "Priya Shah", phone: PRIYA, localDate: "2025-09-15", localStart: "09:00", status: "done" });
  await seed({ name: "Priya Shah", phone: PRIYA, localDate: "2025-10-01", localStart: "09:00", status: "done" });
  await seed({ name: "Priya Shah", phone: PRIYA, localDate: "2026-08-10", localStart: "09:00", status: "done" });
  await seed({ name: "Priya Shah", phone: PRIYA, localDate: "2026-09-07", localStart: "09:30" });
  await seed({ name: "Ravi Kumar", phone: RAVI, localDate: "2026-09-08", localStart: "10:00", status: "done" });
  await seed({ name: "Ravi Kumar", phone: RAVI, localDate: "2026-09-09", localStart: "11:00", status: "cancelled" });
  await seed({ name: "Anita Rao", phone: ANITA, localDate: "2026-07-01", localStart: "09:00", status: "no_show" });
  await seed({
    name: "Anita Rao",
    phone: ANITA,
    practitionerId: doctorMehta,
    localDate: "2026-09-14",
    localStart: "09:00",
    status: "no_show",
    source: "clinic",
  });
  await seed({ name: "Vikram Iyer", phone: VIKRAM, localDate: "2026-06-15", localStart: "09:00", status: "done" });
  await seed({ name: "Vikram Iyer", phone: VIKRAM, localDate: "2026-09-20", localStart: "12:00", status: "cancelled" });
  await seed({ name: "Meera Nair", phone: MEERA, localDate: "2026-05-02", localStart: "09:00", status: "done" });
  await seed({
    name: "Meera Nair",
    phone: MEERA,
    practitionerId: doctorOld,
    localDate: "2026-09-15",
    localStart: "17:30",
    status: "done",
    source: "clinic",
  });
  await seed({ name: "Ravi Kumar", phone: RAVI, localDate: "2026-10-02", localStart: "09:00", status: "done" });
  await seed({ name: "Kiran Das", phone: KIRAN, localDate: "2026-10-05", localStart: "09:00" });
  await seed({ name: "Late Joiner", phone: LATE, localDate: "2026-10-06", localStart: "09:00" });

  await dbs.staff.db.update(practitioners).set({ archivedAt: NOW }).where(eq(practitioners.id, doctorOld));
  await dbs.staff.db.update(practitioners).set({ archivedAt: NOW }).where(eq(practitioners.id, doctorGone));

  await setCreatedAt(businessA, PRIYA, "2026-08-10T05:00:00.000Z");
  // 00:00 IST on 09-01: the first instant of the range.
  await setCreatedAt(businessA, RAVI, "2026-08-31T18:30:00.000Z");
  // 01:30 IST on 07-01, still June in UTC.
  await setCreatedAt(businessA, ANITA, "2026-06-30T20:00:00.000Z");
  await setCreatedAt(businessA, VIKRAM, "2026-06-15T04:00:00.000Z");
  await setCreatedAt(businessA, MEERA, "2026-05-02T04:00:00.000Z");
  // 23:59:59 IST on 09-29: the last second of the range.
  await setCreatedAt(businessA, KIRAN, "2026-09-29T18:29:59.000Z");
  // 00:00 IST on 09-30: after the range, still September.
  await setCreatedAt(businessA, LATE, "2026-09-29T18:30:00.000Z");
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
    { id: STAFF_USER, name: "Sam Staff", email: "sam@brandbasket.test" },
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
  doctorA = await firstPractitioner(businessA);
});

const EMPTY_HOURS = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

function monthsFrom(first: string, values: Readonly<Record<string, readonly [number, number]>>): PatientReport["months"] {
  const [year, month] = first.split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = date.toISOString().slice(0, 7);
    const [newPatients, visits] = values[key] ?? [0, 0];
    return { month: key, newPatients, visits };
  });
}

describe("readPatientReport", () => {
  it("counts every headline number for the range", async () => {
    await seedClinic();
    const report = await reportAs("ownerA");
    expect(report).toMatchObject({
      newPatients: 2, // Ravi (first instant) and Kiran (last second); Late is 09-30 in IST
      returningPatients: 2, // Priya and Meera; Anita's earlier visit was a no-show, Vikram only cancelled
      visits: 2,
      noShows: 1,
      cancellations: 2,
      bookings: 4,
      online: 2,
      clinic: 2,
    });
    expect(report.noShowRate).toBeCloseTo(1 / 3, 10);
  });

  it("buckets the 12 months ending at the range end in the business's time zone", async () => {
    await seedClinic();
    const report = await reportAs("ownerA");
    expect(report.months).toEqual(
      monthsFrom("2025-10", {
        "2025-10": [0, 1],
        "2026-05": [1, 1],
        "2026-06": [1, 1],
        "2026-07": [1, 0], // Anita: 01:30 IST on 07-01
        "2026-08": [1, 1],
        "2026-09": [3, 2], // Ravi, Kiran and Late; Ravi's and Meera's visits
      }),
    );
  });

  it("counts non-cancelled bookings by weekday and start hour", async () => {
    await seedClinic();
    const report = await reportAs("ownerA");
    expect(report.weekdays).toEqual([2, 2, 0, 0, 0, 0, 0]);
    expect(report.hours).toHaveLength(24);
    expect(report.hours.filter((entry) => entry.count > 0)).toEqual([
      { hour: 9, count: 2 },
      { hour: 10, count: 1 },
      { hour: 17, count: 1 },
    ]);
  });

  it("lists active doctors and archived ones with bookings in the range, in the clinic's order", async () => {
    await seedClinic();
    const report = await reportAs("ownerA");
    expect(report.practitioners).toEqual([
      { id: doctorA, name: "Riverside Clinic", archived: false, bookings: 2, attended: 1, noShows: 0 },
      { id: doctorMehta, name: "Dr Mehta", archived: false, bookings: 1, attended: 0, noShows: 1 },
      { id: doctorOld, name: "Dr Old", archived: true, bookings: 1, attended: 1, noShows: 0 },
    ]);
  });

  it("reads patients' first-seen day in the time zone it is given", async () => {
    await seedClinic();
    const report = await reportAs("ownerA", { ...SEPTEMBER, timeZone: "UTC" });
    // In UTC Ravi was created on 08-31; Kiran and Late both on 09-29.
    expect(report.newPatients).toBe(2);
    expect(report.months.at(-1)).toEqual({ month: "2026-09", newPatients: 2, visits: 2 });
    expect(report.months.find((entry) => entry.month === "2026-08")).toEqual({ month: "2026-08", newPatients: 2, visits: 1 });
  });

  it("covers a longer range and a months window ending elsewhere", async () => {
    await seedClinic();
    const report = await reportAs("ownerA", { from: "2026-07-01", to: "2026-09-29", monthsEndingAt: "2026-06-30", timeZone: TIME_ZONE });
    // Anita (07-01 IST), Priya, Ravi and Kiran were first seen in July..September; only Priya and Meera had an
    // Attended visit before July.
    expect(report).toMatchObject({ visits: 3, noShows: 2, cancellations: 2, newPatients: 4, returningPatients: 2 });
    expect(report.months[0]?.month).toBe("2025-07");
    expect(report.months.at(-1)).toEqual({ month: "2026-06", newPatients: 1, visits: 1 });
  });

  it("keeps each business's numbers apart", async () => {
    await seedClinic();
    await seed({
      businessId: businessB,
      practitionerId: await firstPractitioner(businessB),
      name: "Priya Shah",
      phone: PRIYA,
      localDate: "2026-09-10",
      localStart: "15:00",
      status: "done",
    });
    await setCreatedAt(businessB, PRIYA, "2026-09-10T09:30:00.000Z");
    const a = await reportAs("ownerA");
    expect(a).toMatchObject({ visits: 2, bookings: 4 });
    const b = await reportAs("ownerB");
    expect(b).toMatchObject({ newPatients: 1, returningPatients: 0, visits: 1, noShows: 0, cancellations: 0, noShowRate: 0, bookings: 1 });
    expect(b.weekdays).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(b.practitioners).toHaveLength(1);
    expect(b.practitioners[0]).toMatchObject({ name: "Harbour Clinic", bookings: 1, attended: 1 });
  });

  it("gives zeros and no rate for a clinic with nothing in the range", async () => {
    const report = await reportAs("ownerB");
    expect(report).toMatchObject({
      newPatients: 0,
      returningPatients: 0,
      visits: 0,
      noShows: 0,
      cancellations: 0,
      noShowRate: null,
      bookings: 0,
      online: 0,
      clinic: 0,
    });
    expect(report.months).toEqual(monthsFrom("2025-10", {}));
    expect(report.weekdays).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(report.hours).toEqual(EMPTY_HOURS);
    expect(report.practitioners).toEqual([expect.objectContaining({ name: "Harbour Clinic", bookings: 0 })]);
  });

  it("reads nothing once the module is switched off", async () => {
    await seedClinic();
    await setBusinessModule(dbs.staff.db, { businessId: businessA, module: "appointments", enabled: false, staffUserId: STAFF_USER, now: NOW });
    const report = await reportAs("ownerA");
    expect(report).toEqual({
      newPatients: 0,
      returningPatients: 0,
      visits: 0,
      noShows: 0,
      cancellations: 0,
      noShowRate: null,
      bookings: 0,
      months: monthsFrom("2025-10", {}),
      weekdays: [0, 0, 0, 0, 0, 0, 0],
      hours: EMPTY_HOURS,
      practitioners: [],
      online: 0,
      clinic: 0,
    });
  });

  it.each<[string, Partial<PatientReportInput>]>([
    ["a malformed from", { from: "2026-9-01" }],
    ["an impossible to", { to: "2026-02-30" }],
    ["from after to", { from: "2026-09-30", to: "2026-09-01" }],
    ["an unknown time zone", { timeZone: "Mars/Olympus" }],
    ["a malformed months end", { monthsEndingAt: "yesterday" }],
  ])("refuses %s", async (_label, override) => {
    await expect(reportAs("ownerA", { ...SEPTEMBER, ...override })).rejects.toBeInstanceOf(InvalidPatientReportInputError);
  });
});
