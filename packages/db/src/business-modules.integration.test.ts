import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BusinessNotFoundError,
  findBusinessTimeZone,
  InvalidTimeZoneError,
  isModuleEnabled,
  listEnabledModules,
  ModuleNeedsTimeZoneError,
  setBusinessModule,
  setBusinessTimeZone,
  TimeZoneInUseError,
  type ModuleChange,
} from "./queries/business-modules";
import { withTenantScope } from "./scope";
import {
  appointmentServices,
  appointmentSettings,
  businesses,
  businessMembers,
  businessModules,
  practitioners,
  services,
  users,
} from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF_USER = "staff-1";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

function moduleChange(businessId: string, enabled: boolean, now = new Date("2026-09-25T10:00:00.000Z")): ModuleChange {
  return { businessId, module: "appointments", enabled, staffUserId: STAFF_USER, now };
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
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-clinic");
  businessB = idForSlug(inserted, "harbour-salon");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

describe("business time zone", () => {
  it("is null until staff set it", async () => {
    expect(await findBusinessTimeZone(dbs.staff.db, businessA)).toBeNull();
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    expect(await findBusinessTimeZone(dbs.staff.db, businessA)).toBe("Asia/Kolkata");
  });

  it("can be cleared", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await setBusinessTimeZone(dbs.staff.db, businessA, null);
    expect(await findBusinessTimeZone(dbs.staff.db, businessA)).toBeNull();
  });

  it("rejects a zone Intl does not recognise", async () => {
    await expect(setBusinessTimeZone(dbs.staff.db, businessA, "Mars/Base")).rejects.toBeInstanceOf(InvalidTimeZoneError);
    await expect(setBusinessTimeZone(dbs.staff.db, businessA, "")).rejects.toBeInstanceOf(InvalidTimeZoneError);
  });

  it("throws BusinessNotFoundError for a business that does not exist", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    await expect(setBusinessTimeZone(dbs.staff.db, unknownId, "Asia/Kolkata")).rejects.toBeInstanceOf(BusinessNotFoundError);
  });

  it("throws TimeZoneInUseError when clearing while a module is enabled, leaving the zone untouched", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    await expect(setBusinessTimeZone(dbs.staff.db, businessA, null)).rejects.toBeInstanceOf(TimeZoneInUseError);
    expect(await findBusinessTimeZone(dbs.staff.db, businessA)).toBe("Asia/Kolkata");
  });

  it("can be cleared once the module using it is switched off first", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, false));

    await setBusinessTimeZone(dbs.staff.db, businessA, null);
    expect(await findBusinessTimeZone(dbs.staff.db, businessA)).toBeNull();
  });

  it("never lets a concurrent clear and a concurrent module-enable both succeed -- whichever locks the row first decides", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");

    const [clearResult, enableResult] = await Promise.allSettled([
      setBusinessTimeZone(dbs.staff.db, businessA, null),
      setBusinessModule(dbs.staff.db, moduleChange(businessA, true)),
    ]);

    const zone = await findBusinessTimeZone(dbs.staff.db, businessA);
    const enabled = await isModuleEnabled(dbs.staff.db, businessA, "appointments");

    // The two transactions each lock the business row before deciding, so exactly one of them sees the state the
    // other left: the module never ends up enabled with no zone left for it to read dates in.
    expect(enabled && zone === null).toBe(false);

    if (clearResult.status === "fulfilled") {
      // The clear locked the row first, while no module was enabled yet: it went through, and the enable that
      // locked the row after it saw the zone already gone.
      expect(zone).toBeNull();
      expect(enableResult.status).toBe("rejected");
      expect((enableResult as PromiseRejectedResult).reason).toBeInstanceOf(ModuleNeedsTimeZoneError);
      expect(enabled).toBe(false);
    } else {
      // The enable locked the row first, while the zone was still set: it went through, and the clear that locked
      // the row after it saw the now-enabled module.
      expect((clearResult as PromiseRejectedResult).reason).toBeInstanceOf(TimeZoneInUseError);
      expect(zone).toBe("Asia/Kolkata");
      expect(enableResult.status).toBe("fulfilled");
      expect(enabled).toBe(true);
    }
  });
});

describe("setBusinessModule", () => {
  it("throws ModuleNeedsTimeZoneError when enabling without a time zone", async () => {
    await expect(setBusinessModule(dbs.staff.db, moduleChange(businessA, true))).rejects.toBeInstanceOf(ModuleNeedsTimeZoneError);
    expect(await isModuleEnabled(dbs.staff.db, businessA, "appointments")).toBe(false);
  });

  it("throws BusinessNotFoundError for a business that does not exist", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    await expect(setBusinessModule(dbs.staff.db, moduleChange(unknownId, true))).rejects.toBeInstanceOf(BusinessNotFoundError);
    await expect(setBusinessModule(dbs.staff.db, moduleChange(unknownId, false))).rejects.toBeInstanceOf(BusinessNotFoundError);
  });

  it("truncates a seeded service name over 80 characters", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    const longName = `${"Consultation with the specialist "}${"x".repeat(60)}`;
    expect(longName.length).toBeGreaterThan(80);
    await dbs.staff.db.insert(services).values([{ businessId: businessA, name: longName, position: 0 }]);

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const seeded = await dbs.staff.db
      .select({ name: appointmentServices.name })
      .from(appointmentServices)
      .where(eq(appointmentServices.businessId, businessA));
    expect(seeded).toEqual([{ name: longName.slice(0, 80) }]);
    expect(seeded[0]?.name.length).toBe(80);
  });

  it("creates settings and seeds services from live onboarding services when enabled with a time zone", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await dbs.staff.db.insert(services).values([
      { businessId: businessA, name: "Consultation", position: 0 },
      { businessId: businessA, name: "Follow-up", position: 1 },
      { businessId: businessA, name: "Deleted service", position: 2, deletedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    expect(await isModuleEnabled(dbs.staff.db, businessA, "appointments")).toBe(true);
    expect(await listEnabledModules(dbs.staff.db, businessA)).toEqual(["appointments"]);

    const settingsRows = await dbs.staff.db.select().from(appointmentSettings).where(eq(appointmentSettings.businessId, businessA));
    expect(settingsRows).toHaveLength(1);
    expect(settingsRows[0]?.accepting).toBe(true);

    const seeded = await dbs.staff.db
      .select({ name: appointmentServices.name, position: appointmentServices.position })
      .from(appointmentServices)
      .where(eq(appointmentServices.businessId, businessA))
      .orderBy(appointmentServices.position);
    expect(seeded).toEqual([
      { name: "Consultation", position: 0 },
      { name: "Follow-up", position: 1 },
    ]);
  });

  it("does not duplicate services or settings when enabled a second time", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await dbs.staff.db.insert(services).values([{ businessId: businessA, name: "Consultation", position: 0 }]);
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, false));
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const seeded = await dbs.staff.db.select().from(appointmentServices).where(eq(appointmentServices.businessId, businessA));
    expect(seeded).toHaveLength(1);
    const settingsRows = await dbs.staff.db.select().from(appointmentSettings).where(eq(appointmentSettings.businessId, businessA));
    expect(settingsRows).toHaveLength(1);
  });

  it("seeds one default practitioner named after the business when enabled", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const seeded = await dbs.staff.db
      .select({
        name: practitioners.name,
        title: practitioners.title,
        usesClinicHours: practitioners.usesClinicHours,
        position: practitioners.position,
        archivedAt: practitioners.archivedAt,
      })
      .from(practitioners)
      .where(eq(practitioners.businessId, businessA));
    expect(seeded).toEqual([
      { name: "Riverside Clinic", title: null, usesClinicHours: true, position: 0, archivedAt: null },
    ]);
    const other = await dbs.staff.db.select().from(practitioners).where(eq(practitioners.businessId, businessB));
    expect(other).toEqual([]);
  });

  it("does not seed another practitioner when switched off and on again", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, false));
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const seeded = await dbs.staff.db.select().from(practitioners).where(eq(practitioners.businessId, businessA));
    expect(seeded).toHaveLength(1);
  });

  it("does not seed a practitioner when the business already has one, even an archived one", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await dbs.staff.db.insert(practitioners).values({
      businessId: businessA,
      name: "Dr Meera Iyer",
      position: 0,
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const rows = await dbs.staff.db
      .select({ name: practitioners.name })
      .from(practitioners)
      .where(eq(practitioners.businessId, businessA));
    expect(rows).toEqual([{ name: "Dr Meera Iyer" }]);
  });

  it("truncates a business name longer than a practitioner name may be", async () => {
    const longName = "B".repeat(120);
    await dbs.staff.db.update(businesses).set({ name: longName }).where(eq(businesses.id, businessA));
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    const rows = await dbs.staff.db
      .select({ name: practitioners.name })
      .from(practitioners)
      .where(eq(practitioners.businessId, businessA));
    expect(rows).toEqual([{ name: longName.slice(0, 80) }]);
  });

  it("keeps settings and services when disabled", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await dbs.staff.db.insert(services).values([{ businessId: businessA, name: "Consultation", position: 0 }]);
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));

    await setBusinessModule(dbs.staff.db, moduleChange(businessA, false));

    expect(await isModuleEnabled(dbs.staff.db, businessA, "appointments")).toBe(false);
    const settingsRows = await dbs.staff.db.select().from(appointmentSettings).where(eq(appointmentSettings.businessId, businessA));
    expect(settingsRows).toHaveLength(1);
    const seeded = await dbs.staff.db.select().from(appointmentServices).where(eq(appointmentServices.businessId, businessA));
    expect(seeded).toHaveLength(1);
  });
});

describe("row-level security for business_modules", () => {
  beforeEach(async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await setBusinessTimeZone(dbs.staff.db, businessB, "Asia/Kolkata");
    await setBusinessModule(dbs.staff.db, moduleChange(businessA, true));
    await setBusinessModule(dbs.staff.db, moduleChange(businessB, true));
  });

  it("lets firstfold_app read its own business's modules, not another's", async () => {
    const own = await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) => listEnabledModules(tx, businessA));
    const other = await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) => listEnabledModules(tx, businessB));
    expect(own).toEqual(["appointments"]);
    expect(other).toEqual([]);
  });

  it("denies firstfold_app any INSERT into business_modules", async () => {
    const message = await captureErrorText(
      withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) =>
        tx.insert(businessModules).values({
          businessId: businessA,
          module: "appointments",
          enabled: true,
          changedByUserId: OWNER_A,
        }),
      ),
    );
    expect(message).toMatch(/permission denied for table business_modules/);
  });
});
