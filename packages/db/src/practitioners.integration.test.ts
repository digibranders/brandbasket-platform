import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setBusinessModule, setBusinessTimeZone } from "./queries/business-modules";
import {
  addPractitioner,
  addPractitionerLeave,
  archivePractitioner,
  listPractitionerHours,
  listPractitionerLeave,
  listPractitioners,
  MAX_ACTIVE_PRACTITIONERS,
  movePractitioner,
  removePractitionerLeave,
  setPractitionerSchedule,
  updatePractitioner,
} from "./queries/practitioners";
import {
  appointments,
  businesses,
  businessMembers,
  practitionerHours,
  practitionerLeave,
  practitioners,
  users,
  type AppointmentStatus,
} from "./schema";
import { withTenantScope, type ScopedTransaction, type TenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF_USER = "staff-1";
const NOW = new Date("2026-09-25T10:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

function scopeFor(who: "ownerA" | "ownerB"): TenantScope {
  return who === "ownerA" ? { userId: OWNER_A, businessId: businessA } : { userId: OWNER_B, businessId: businessB };
}

function as<T>(who: "ownerA" | "ownerB", work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, scopeFor(who), work);
}

async function setAppointmentsModule(businessId: string, enabled: boolean): Promise<void> {
  await setBusinessModule(dbs.staff.db, { businessId, module: "appointments", enabled, staffUserId: STAFF_USER, now: NOW });
}

/** Staff-side insert, so a test can set up a practitioner without depending on fynix_app's own grants. */
async function insertPractitionerAsStaff(businessId: string, name: string, position: number): Promise<string> {
  const [row] = await dbs.staff.db
    .insert(practitioners)
    .values({ businessId, name, position })
    .returning({ id: practitioners.id });
  if (row === undefined) throw new Error(`Practitioner "${name}" was not inserted`);
  return row.id;
}

/**
 * Staff-side insert, the way bookSlot writes a booking. `startsAt` defaults to an hour from real now: the guard
 * trigger compares against Postgres's own now(), not any JS clock a test could pass.
 */
async function insertAppointmentAsStaff(
  businessId: string,
  practitionerId: string,
  status: AppointmentStatus = "booked",
  startsAt: Date = new Date(Date.now() + 60 * 60 * 1000),
): Promise<string> {
  const [row] = await dbs.staff.db
    .insert(appointments)
    .values({
      businessId,
      practitionerId,
      patientName: "Priya Shah",
      phone: "+919876543210",
      localDate: "2026-10-01",
      localStart: "09:30",
      localEnd: "10:00",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      status,
      cancelledAt: status === "cancelled" ? NOW : null,
      doneAt: status === "done" ? NOW : null,
    })
    .returning({ id: appointments.id });
  if (row === undefined) throw new Error("Appointment was not inserted");
  return row.id;
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
    { id: STAFF_USER, name: "Sam Staff", email: "sam@fynix.test" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-clinic", name: "Riverside Clinic" },
      { slug: "harbour-dental", name: "Harbour Dental" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-clinic");
  businessB = idForSlug(inserted, "harbour-dental");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
  await setBusinessTimeZone(dbs.staff.db, businessB, "Asia/Kolkata");
  await setAppointmentsModule(businessA, true);
  await setAppointmentsModule(businessB, true);
});

describe("practitioners for a tenant with appointments on", () => {
  it("inserts, lists and updates its own practitioners", async () => {
    const [created] = await as("ownerA", (tx) =>
      tx.insert(practitioners).values({ businessId: businessA, name: "Dr Meera Iyer", position: 1 }).returning(),
    );
    expect(created?.usesClinicHours).toBe(true);
    const id = created?.id ?? "";

    const listed = await as("ownerA", (tx) => tx.select({ id: practitioners.id }).from(practitioners));
    expect(listed.map((row) => row.id)).toContain(id);

    const archivedAt = new Date("2026-09-26T00:00:00.000Z");
    const [updated] = await as("ownerA", (tx) =>
      tx
        .update(practitioners)
        .set({ name: "Dr Meera Iyer-Rao", title: "Sports physiotherapist", usesClinicHours: false, position: 2, archivedAt })
        .where(eq(practitioners.id, id))
        .returning(),
    );
    expect(updated).toMatchObject({
      name: "Dr Meera Iyer-Rao",
      title: "Sports physiotherapist",
      usesClinicHours: false,
      position: 2,
      archivedAt,
    });
  });

  it("may not delete a practitioner, since past bookings point at it", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const message = await captureErrorText(as("ownerA", (tx) => tx.delete(practitioners).where(eq(practitioners.id, id))));
    expect(message).toMatch(/permission denied for table practitioners/);
  });

  it("may not move a practitioner to another business", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(practitioners).set({ businessId: businessB }).where(eq(practitioners.id, id))),
    );
    expect(message).toMatch(/permission denied for table practitioners/);
  });

  it("may not insert a practitioner for another business", async () => {
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.insert(practitioners).values({ businessId: businessB, name: "Dr Sneaky", position: 1 })),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("inserts and deletes its own practitioner_hours and practitioner_leave", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);

    await as("ownerA", (tx) =>
      tx.insert(practitionerHours).values([
        { businessId: businessA, practitionerId: id, dayOfWeek: 0, opensAt: "09:00", closesAt: "13:00" },
        { businessId: businessA, practitionerId: id, dayOfWeek: 0, opensAt: "16:00", closesAt: "19:00" },
        { businessId: businessA, practitionerId: id, dayOfWeek: 6, closed: true },
      ]),
    );
    await as("ownerA", (tx) =>
      tx.insert(practitionerLeave).values({ businessId: businessA, practitionerId: id, startsOn: "2026-10-05", endsOn: "2026-10-09", note: "Conference" }),
    );
    expect(await as("ownerA", (tx) => tx.select().from(practitionerHours))).toHaveLength(3);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerLeave))).toHaveLength(1);

    await as("ownerA", (tx) => tx.delete(practitionerHours).where(eq(practitionerHours.practitionerId, id)));
    await as("ownerA", (tx) => tx.delete(practitionerLeave).where(eq(practitionerLeave.practitionerId, id)));
    expect(await as("ownerA", (tx) => tx.select().from(practitionerHours))).toEqual([]);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerLeave))).toEqual([]);
  });

  it("refuses hours or leave on another business's practitioner through the composite foreign key", async () => {
    const other = await insertPractitionerAsStaff(businessB, "Dr Other", 1);
    const hoursMessage = await captureErrorText(
      as("ownerA", (tx) =>
        tx.insert(practitionerHours).values({ businessId: businessA, practitionerId: other, dayOfWeek: 0, openAllDay: true }),
      ),
    );
    expect(hoursMessage).toMatch(/practitioner_hours_practitioner_business_fk/);
    const leaveMessage = await captureErrorText(
      as("ownerA", (tx) =>
        tx.insert(practitionerLeave).values({ businessId: businessA, practitionerId: other, startsOn: "2026-10-05", endsOn: "2026-10-05" }),
      ),
    );
    expect(leaveMessage).toMatch(/practitioner_leave_practitioner_business_fk/);
  });

  it("rejects hours that break the business_hours rules", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx.insert(practitionerHours).values({ businessId: businessA, practitionerId: id, dayOfWeek: 0, opensAt: "09:00", closesAt: "09:00" }),
      ),
    );
    expect(message).toMatch(/practitioner_hours_open_times_check/);
  });

  it("cannot see another tenant's practitioners, hours or leave", async () => {
    const other = await insertPractitionerAsStaff(businessB, "Dr Other", 1);
    await dbs.staff.db
      .insert(practitionerHours)
      .values({ businessId: businessB, practitionerId: other, dayOfWeek: 0, openAllDay: true });
    await dbs.staff.db
      .insert(practitionerLeave)
      .values({ businessId: businessB, practitionerId: other, startsOn: "2026-10-05", endsOn: "2026-10-05" });

    const seen = await as("ownerA", (tx) => tx.select({ id: practitioners.id }).from(practitioners));
    expect(seen.map((row) => row.id)).not.toContain(other);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerHours))).toEqual([]);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerLeave))).toEqual([]);
    const renamed = await as("ownerA", (tx) =>
      tx.update(practitioners).set({ name: "Hijacked" }).where(eq(practitioners.id, other)).returning(),
    );
    expect(renamed).toEqual([]);
  });

  it("sees no practitioners, hours or leave once the module is switched off", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    await dbs.staff.db.insert(practitionerHours).values({ businessId: businessA, practitionerId: id, dayOfWeek: 0, openAllDay: true });
    await dbs.staff.db
      .insert(practitionerLeave)
      .values({ businessId: businessA, practitionerId: id, startsOn: "2026-10-05", endsOn: "2026-10-05" });
    await setAppointmentsModule(businessA, false);

    expect(await as("ownerA", (tx) => tx.select().from(practitioners))).toEqual([]);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerHours))).toEqual([]);
    expect(await as("ownerA", (tx) => tx.select().from(practitionerLeave))).toEqual([]);
  });

  it("is denied to fynix_public", async () => {
    const message = await captureErrorText(dbs.publicRole.db.select().from(practitioners));
    expect(message).toMatch(/permission denied for table practitioners/);
  });
});

describe("the per-practitioner double-booking backstop", () => {
  it("lets two practitioners be booked at the same instant but not one practitioner twice", async () => {
    const first = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const second = await insertPractitionerAsStaff(businessA, "Dr Arjun Rao", 2);
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await insertAppointmentAsStaff(businessA, first, "booked", startsAt);
    await insertAppointmentAsStaff(businessA, second, "booked", startsAt);
    const message = await captureErrorText(insertAppointmentAsStaff(businessA, first, "booked", startsAt));
    expect(message).toMatch(/appointments_practitioner_id_starts_at_idx/);
  });

  it("frees the slot once the appointment holding it is cancelled", async () => {
    const first = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await insertAppointmentAsStaff(businessA, first, "cancelled", startsAt);
    await expect(insertAppointmentAsStaff(businessA, first, "booked", startsAt)).resolves.toEqual(expect.any(String));
  });
});

describe("reassigning an appointment to another practitioner", () => {
  let first = "";
  let second = "";

  beforeEach(async () => {
    first = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    second = await insertPractitionerAsStaff(businessA, "Dr Arjun Rao", 2);
  });

  it("lets the tenant move a booked appointment to its own practitioner", async () => {
    const id = await insertAppointmentAsStaff(businessA, first);
    const [moved] = await as("ownerA", (tx) =>
      tx
        .update(appointments)
        .set({ practitionerId: second })
        .where(and(eq(appointments.id, id), eq(appointments.status, "booked")))
        .returning({ practitionerId: appointments.practitionerId }),
    );
    expect(moved?.practitionerId).toBe(second);
  });

  it("refuses another business's practitioner through the composite foreign key", async () => {
    const id = await insertAppointmentAsStaff(businessA, first);
    const foreign = await insertPractitionerAsStaff(businessB, "Dr Other", 1);
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ practitionerId: foreign }).where(eq(appointments.id, id))),
    );
    expect(message).toMatch(/appointments_practitioner_business_fk/);
  });

  it("refuses changing the practitioner in the same update that changes status", async () => {
    const id = await insertAppointmentAsStaff(businessA, first);
    const message = await captureErrorText(
      as("ownerA", (tx) =>
        tx
          .update(appointments)
          .set({ practitionerId: second, status: "cancelled", cancelledAt: NOW })
          .where(eq(appointments.id, id)),
      ),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may only change practitioner_id on a booked appointment that stays booked/);
  });

  it.each(["cancelled", "done"] as const)("refuses changing the practitioner of a %s appointment", async (status) => {
    const id = await insertAppointmentAsStaff(businessA, first, status);
    const message = await captureErrorText(
      as("ownerA", (tx) => tx.update(appointments).set({ practitionerId: second }).where(eq(appointments.id, id))),
    );
    expect(message).toMatch(/(fynix_app|fynix_app) may only change practitioner_id on a booked appointment that stays booked/);
  });
});

/** The practitioner setBusinessModule seeded (position 0) when the module was switched on in beforeEach. */
async function defaultPractitionerId(businessId: string): Promise<string> {
  const [row] = await dbs.staff.db
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.businessId, businessId))
    .limit(1);
  if (row === undefined) throw new Error(`Business ${businessId} has no practitioner`);
  return row.id;
}

async function archiveAsStaff(id: string): Promise<void> {
  await dbs.staff.db.update(practitioners).set({ archivedAt: NOW }).where(eq(practitioners.id, id));
}

async function activeNamesA(): Promise<string[]> {
  const rows = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: false }));
  return rows.map((row) => row.name);
}

const SPLIT_SHIFT = [
  { dayOfWeek: 0, opensAt: "09:00", closesAt: "13:00", closed: false, openAllDay: false },
  { dayOfWeek: 0, opensAt: "16:00", closesAt: "19:00", closed: false, openAllDay: false },
  { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
] as const;

describe("listPractitioners", () => {
  it("orders by position, then id, and leaves archived practitioners out unless asked", async () => {
    const later = await insertPractitionerAsStaff(businessA, "Dr Later", 2);
    await insertPractitionerAsStaff(businessA, "Dr Earlier", 1);
    await archiveAsStaff(later);
    await insertPractitionerAsStaff(businessB, "Dr Other", 1);

    expect(await activeNamesA()).toEqual(["Riverside Clinic", "Dr Earlier"]);
    const all = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: true }));
    expect(all.map((row) => row.name)).toEqual(["Riverside Clinic", "Dr Earlier", "Dr Later"]);
    expect(all[2]).toMatchObject({ id: later, archivedAt: NOW, usesClinicHours: true, title: null, photoMediaId: null, position: 2 });
  });
});

describe("addPractitioner", () => {
  it("appends one past the highest position, archived practitioners included, and blanks a blank title", async () => {
    const archived = await insertPractitionerAsStaff(businessA, "Dr Gone", 5);
    await archiveAsStaff(archived);

    const result = await as("ownerA", (tx) => addPractitioner(tx, { name: "Dr Meera Iyer", title: "  " }));
    expect(result.kind).toBe("added");
    if (result.kind !== "added") return;
    expect(result.practitioner).toMatchObject({ name: "Dr Meera Iyer", title: null, position: 6, usesClinicHours: true, archivedAt: null });
    expect(await activeNamesA()).toEqual(["Riverside Clinic", "Dr Meera Iyer"]);
  });

  it(`refuses a practitioner past ${MAX_ACTIVE_PRACTITIONERS} active ones, counting active only`, async () => {
    const extras: string[] = [];
    for (let position = 1; position < MAX_ACTIVE_PRACTITIONERS; position += 1) {
      extras.push(await insertPractitionerAsStaff(businessA, `Dr ${position}`, position));
    }
    expect(await as("ownerA", (tx) => addPractitioner(tx, { name: "Dr One Too Many", title: null }))).toEqual({ kind: "limit" });

    await archiveAsStaff(extras[0] ?? "");
    const result = await as("ownerA", (tx) => addPractitioner(tx, { name: "Dr Replacement", title: "GP" }));
    expect(result).toMatchObject({ kind: "added", practitioner: { name: "Dr Replacement", title: "GP" } });
  });
});

describe("updatePractitioner", () => {
  it("renames and retitles its own practitioner", async () => {
    const id = await defaultPractitionerId(businessA);
    expect(await as("ownerA", (tx) => updatePractitioner(tx, id, { name: "Dr Meera Iyer", title: "Physiotherapist" }))).toBe(true);
    const [row] = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(row).toMatchObject({ name: "Dr Meera Iyer", title: "Physiotherapist" });
  });

  it("returns false for another tenant's practitioner or a non-UUID id", async () => {
    const other = await defaultPractitionerId(businessB);
    expect(await as("ownerA", (tx) => updatePractitioner(tx, other, { name: "Hijacked", title: null }))).toBe(false);
    expect(await as("ownerA", (tx) => updatePractitioner(tx, "not-a-uuid", { name: "Hijacked", title: null }))).toBe(false);
    const [row] = await as("ownerB", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(row?.name).toBe("Harbour Dental");
  });
});

describe("setPractitionerSchedule and listPractitionerHours", () => {
  it("replaces its own hours all at once and switches off clinic hours", async () => {
    const id = await defaultPractitionerId(businessA);
    expect(await as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: false, hours: SPLIT_SHIFT }))).toBe(true);
    const first = await as("ownerA", (tx) => listPractitionerHours(tx, id));
    expect(first.map((row) => [row.dayOfWeek, row.opensAt, row.closesAt, row.closed])).toEqual([
      [0, "09:00:00", "13:00:00", false],
      [0, "16:00:00", "19:00:00", false],
      [6, null, null, true],
    ]);

    const replacement = [{ dayOfWeek: 2, opensAt: null, closesAt: null, closed: false, openAllDay: true }];
    expect(await as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: false, hours: replacement }))).toBe(true);
    const second = await as("ownerA", (tx) => listPractitionerHours(tx, id));
    expect(second).toEqual([expect.objectContaining({ dayOfWeek: 2, openAllDay: true })]);
    const [row] = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(row?.usesClinicHours).toBe(false);
  });

  it("leaves the old hours in place when a new row breaks the hours rules", async () => {
    const id = await defaultPractitionerId(businessA);
    await as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: false, hours: SPLIT_SHIFT }));
    const broken = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "09:00", closed: false, openAllDay: false }];
    await expect(as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: false, hours: broken }))).rejects.toThrow();
    expect(await as("ownerA", (tx) => listPractitionerHours(tx, id))).toHaveLength(3);
  });

  it("deletes its own hours when switching back to clinic hours", async () => {
    const id = await defaultPractitionerId(businessA);
    await as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: false, hours: SPLIT_SHIFT }));
    expect(await as("ownerA", (tx) => setPractitionerSchedule(tx, id, { usesClinicHours: true }))).toBe(true);
    expect(await as("ownerA", (tx) => listPractitionerHours(tx, id))).toEqual([]);
    const [row] = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(row?.usesClinicHours).toBe(true);
  });

  it("returns false and touches nothing for another tenant's practitioner", async () => {
    const other = await defaultPractitionerId(businessB);
    await as("ownerB", (tx) => setPractitionerSchedule(tx, other, { usesClinicHours: false, hours: SPLIT_SHIFT }));

    expect(await as("ownerA", (tx) => setPractitionerSchedule(tx, other, { usesClinicHours: true }))).toBe(false);
    expect(await as("ownerA", (tx) => setPractitionerSchedule(tx, "not-a-uuid", { usesClinicHours: true }))).toBe(false);
    expect(await as("ownerA", (tx) => listPractitionerHours(tx, other))).toEqual([]);
    expect(await as("ownerB", (tx) => listPractitionerHours(tx, other))).toHaveLength(3);
  });
});

describe("practitioner leave", () => {
  it("adds leave, lists it by start day and removes it", async () => {
    const id = await defaultPractitionerId(businessA);
    const later = await as("ownerA", (tx) => addPractitionerLeave(tx, id, { startsOn: "2026-11-02", endsOn: "2026-11-06", note: "Conference" }));
    const sooner = await as("ownerA", (tx) => addPractitionerLeave(tx, id, { startsOn: "2026-10-05", endsOn: "2026-10-05", note: " " }));
    expect(sooner).toMatchObject({ startsOn: "2026-10-05", endsOn: "2026-10-05", note: null });

    const listed = await as("ownerA", (tx) => listPractitionerLeave(tx, id));
    expect(listed.map((row) => row.id)).toEqual([sooner?.id, later?.id]);
    expect(listed[1]).toEqual({ id: later?.id, startsOn: "2026-11-02", endsOn: "2026-11-06", note: "Conference" });

    expect(await as("ownerA", (tx) => removePractitionerLeave(tx, sooner?.id ?? ""))).toBe(true);
    expect(await as("ownerA", (tx) => removePractitionerLeave(tx, sooner?.id ?? ""))).toBe(false);
    expect((await as("ownerA", (tx) => listPractitionerLeave(tx, id))).map((row) => row.id)).toEqual([later?.id]);
  });

  it("returns null or false for another tenant's practitioner or leave", async () => {
    const other = await defaultPractitionerId(businessB);
    const theirs = await as("ownerB", (tx) => addPractitionerLeave(tx, other, { startsOn: "2026-10-05", endsOn: "2026-10-05", note: null }));

    expect(await as("ownerA", (tx) => addPractitionerLeave(tx, other, { startsOn: "2026-10-05", endsOn: "2026-10-05", note: null }))).toBeNull();
    expect(await as("ownerA", (tx) => addPractitionerLeave(tx, "not-a-uuid", { startsOn: "2026-10-05", endsOn: "2026-10-05", note: null }))).toBeNull();
    expect(await as("ownerA", (tx) => listPractitionerLeave(tx, other))).toEqual([]);
    expect(await as("ownerA", (tx) => removePractitionerLeave(tx, theirs?.id ?? ""))).toBe(false);
    expect(await as("ownerA", (tx) => removePractitionerLeave(tx, "not-a-uuid"))).toBe(false);
    expect(await as("ownerB", (tx) => listPractitionerLeave(tx, other))).toHaveLength(1);
  });
});

describe("movePractitioner", () => {
  it("swaps with the active neighbour above or below, stepping over archived ones, and refuses at the edges", async () => {
    const first = await defaultPractitionerId(businessA);
    const archived = await insertPractitionerAsStaff(businessA, "Dr Gone", 1);
    const second = await insertPractitionerAsStaff(businessA, "Dr Arjun Rao", 2);
    const third = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 3);
    await archiveAsStaff(archived);

    expect(await as("ownerA", (tx) => movePractitioner(tx, first, "up"))).toBe(false);
    expect(await as("ownerA", (tx) => movePractitioner(tx, third, "down"))).toBe(false);
    expect(await activeNamesA()).toEqual(["Riverside Clinic", "Dr Arjun Rao", "Dr Meera Iyer"]);

    expect(await as("ownerA", (tx) => movePractitioner(tx, third, "up"))).toBe(true);
    expect(await activeNamesA()).toEqual(["Riverside Clinic", "Dr Meera Iyer", "Dr Arjun Rao"]);

    expect(await as("ownerA", (tx) => movePractitioner(tx, first, "down"))).toBe(true);
    expect(await activeNamesA()).toEqual(["Dr Meera Iyer", "Riverside Clinic", "Dr Arjun Rao"]);

    expect(await as("ownerA", (tx) => movePractitioner(tx, second, "up"))).toBe(true);
    expect(await activeNamesA()).toEqual(["Dr Meera Iyer", "Dr Arjun Rao", "Riverside Clinic"]);
  });

  it("still reorders practitioners that share a position", async () => {
    await insertPractitionerAsStaff(businessA, "Dr Tie One", 0);
    const names = await activeNamesA();
    const [, lower] = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(await as("ownerA", (tx) => movePractitioner(tx, lower?.id ?? "", "up"))).toBe(true);
    expect(await activeNamesA()).toEqual([names[1], names[0]]);
  });

  it("returns false for an archived, another tenant's or a non-UUID practitioner", async () => {
    await insertPractitionerAsStaff(businessA, "Dr Arjun Rao", 1);
    const archived = await insertPractitionerAsStaff(businessA, "Dr Gone", 2);
    await archiveAsStaff(archived);
    await insertPractitionerAsStaff(businessB, "Dr Other", 1);
    const other = await defaultPractitionerId(businessB);

    expect(await as("ownerA", (tx) => movePractitioner(tx, archived, "up"))).toBe(false);
    expect(await as("ownerA", (tx) => movePractitioner(tx, other, "down"))).toBe(false);
    expect(await as("ownerA", (tx) => movePractitioner(tx, "not-a-uuid", "down"))).toBe(false);
    const theirs = await as("ownerB", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(theirs.map((row) => row.name)).toEqual(["Harbour Dental", "Dr Other"]);
  });
});

describe("archivePractitioner", () => {
  it("archives a practitioner with no upcoming bookings, ignoring cancelled and past ones", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    await insertAppointmentAsStaff(businessA, id, "cancelled", startsAt);
    await insertAppointmentAsStaff(businessA, id, "booked", new Date(startsAt.getTime() + 60 * 60 * 1000));
    const afterBothStarted = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

    expect(await as("ownerA", (tx) => archivePractitioner(tx, id, afterBothStarted))).toEqual({ kind: "archived" });
    const all = await as("ownerA", (tx) => listPractitioners(tx, { includeArchived: true }));
    expect(all.find((row) => row.id === id)?.archivedAt).toEqual(afterBothStarted);
    expect(await activeNamesA()).toEqual(["Riverside Clinic"]);
  });

  it("refuses while the practitioner has upcoming booked appointments and says how many", async () => {
    const id = await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 1);
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    await insertAppointmentAsStaff(businessA, id, "booked", startsAt);
    await insertAppointmentAsStaff(businessA, id, "booked", new Date(startsAt.getTime() + 60 * 60 * 1000));

    expect(await as("ownerA", (tx) => archivePractitioner(tx, id, NOW))).toEqual({ kind: "has_upcoming", count: 2 });
    expect(await activeNamesA()).toEqual(["Riverside Clinic", "Dr Meera Iyer"]);
  });

  it("refuses to archive the last active practitioner", async () => {
    const id = await defaultPractitionerId(businessA);
    const archived = await insertPractitionerAsStaff(businessA, "Dr Gone", 1);
    await archiveAsStaff(archived);
    expect(await as("ownerA", (tx) => archivePractitioner(tx, id, NOW))).toEqual({ kind: "last" });
    expect(await activeNamesA()).toEqual(["Riverside Clinic"]);
  });

  it("reports not_found for another tenant's, an already archived or a non-UUID practitioner", async () => {
    await insertPractitionerAsStaff(businessB, "Dr Other", 1);
    const other = await defaultPractitionerId(businessB);
    const archived = await insertPractitionerAsStaff(businessA, "Dr Gone", 1);
    await archiveAsStaff(archived);
    await insertPractitionerAsStaff(businessA, "Dr Meera Iyer", 2);

    expect(await as("ownerA", (tx) => archivePractitioner(tx, other, NOW))).toEqual({ kind: "not_found" });
    expect(await as("ownerA", (tx) => archivePractitioner(tx, archived, NOW))).toEqual({ kind: "not_found" });
    expect(await as("ownerA", (tx) => archivePractitioner(tx, "not-a-uuid", NOW))).toEqual({ kind: "not_found" });
    const theirs = await as("ownerB", (tx) => listPractitioners(tx, { includeArchived: false }));
    expect(theirs).toHaveLength(2);
  });
});
