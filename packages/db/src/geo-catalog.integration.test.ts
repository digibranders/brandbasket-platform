import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createGeoArea,
  createGeoCategory,
  createGeoDistrict,
  loadGeoAdminCatalog,
  loadGeoCatalog,
  updateGeoArea,
  updateGeoCategory,
  updateGeoDistrict,
} from "./queries/geo-catalog";
import { geoAreas, geoDistricts } from "./schema";
import { captureErrorText, describeError, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

beforeAll(async () => {
  dbs = await openTestDatabases();
});
afterAll(async () => {
  await dbs.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

async function newDistrict(slug = "pune", name = "Pune"): Promise<string> {
  return createGeoDistrict(dbs.staff.db, { stateCode: "mh", slug, name });
}

describe("districts", () => {
  it("starts a new district as an unlocked draft that is off", async () => {
    const id = await newDistrict();
    const row = (await dbs.staff.db.select().from(geoDistricts).where(eq(geoDistricts.id, id)))[0];
    expect(row?.status).toBe("off");
    expect(row?.slugLockedAt).toBeNull();
  });

  it("lets a draft be renamed and re-addressed, then locks the address when it is switched on", async () => {
    const id = await newDistrict("pne", "Pune");
    await updateGeoDistrict(dbs.staff.db, id, { slug: "pune" });
    await updateGeoDistrict(dbs.staff.db, id, { status: "soon" });
    const row = (await dbs.staff.db.select().from(geoDistricts).where(eq(geoDistricts.id, id)))[0];
    expect(row?.slug).toBe("pune");
    expect(row?.slugLockedAt).not.toBeNull();
    await expect(updateGeoDistrict(dbs.staff.db, id, { slug: "poona" })).rejects.toThrow(/permanent/);
    await updateGeoDistrict(dbs.staff.db, id, { status: "off", name: "Pune City" });
    expect((await dbs.staff.db.select().from(geoDistricts).where(eq(geoDistricts.id, id)))[0]?.name).toBe("Pune City");
  });

  it("makes the database itself refuse a slug change after publishing, whoever asks", async () => {
    const id = await newDistrict();
    await updateGeoDistrict(dbs.staff.db, id, { status: "soon" });
    const text = await captureErrorText(dbs.owner.db.update(geoDistricts).set({ slug: "other" }).where(eq(geoDistricts.id, id)));
    expect(text).toMatch(/is locked/);
    await dbs.owner.db.update(geoDistricts).set({ slugLockedAt: null }).where(eq(geoDistricts.id, id));
    // The trigger puts the stamp back, so clearing it does not open the address again.
    expect((await dbs.staff.db.select().from(geoDistricts).where(eq(geoDistricts.id, id)))[0]?.slugLockedAt).not.toBeNull();
  });

  it("refuses live until an area is on, and refuses a duplicate or reserved address", async () => {
    const id = await newDistrict();
    await expect(updateGeoDistrict(dbs.staff.db, id, { status: "live" })).rejects.toThrow(/at least one area/);
    const area = await createGeoArea(dbs.staff.db, { districtId: id, slug: "kothrud", name: "Kothrud", citySlug: "pune", cityName: "Pune", pincodes: ["411038"], lat: null, lon: null });
    await updateGeoArea(dbs.staff.db, area, { status: "on" });
    await updateGeoDistrict(dbs.staff.db, id, { status: "live" });
    await expect(newDistrict()).rejects.toThrow(/already taken/);
    await expect(newDistrict("business", "Business")).rejects.toThrow(/already used by the website/);
  });
});

describe("areas", () => {
  it("stores PINs and a point, and keeps them editable after the address is locked", async () => {
    const district = await newDistrict();
    const id = await createGeoArea(dbs.staff.db, { districtId: district, slug: "baner", name: "Baner", citySlug: "pune", cityName: "Pune", pincodes: ["411045"], lat: 18.559, lon: 73.78 });
    await updateGeoArea(dbs.staff.db, id, { status: "on" });
    await updateGeoArea(dbs.staff.db, id, { pincodes: ["411045", "411069"], name: "Baner Road" });
    const row = (await dbs.staff.db.select().from(geoAreas).where(eq(geoAreas.id, id)))[0];
    expect(row?.pincodes).toEqual(["411045", "411069"]);
    expect(row?.slugLockedAt).not.toBeNull();
    await expect(updateGeoArea(dbs.staff.db, id, { slug: "baner-road" })).rejects.toThrow(/permanent/);
  });

  it("refuses a half point, and an address a category already has", async () => {
    const district = await newDistrict();
    await createGeoCategory(dbs.staff.db, { slug: "dentists", label: "Dentists", singular: "Dentist", parentSlug: null, keywords: [], hasPage: true });
    const base = { districtId: district, slug: "x", name: "X", citySlug: "pune", cityName: "Pune", pincodes: [] as string[] };
    await expect(createGeoArea(dbs.staff.db, { ...base, lat: 18.5, lon: null })).rejects.toThrow(/both the latitude and the longitude/);
    await expect(createGeoArea(dbs.staff.db, { ...base, slug: "dentists", lat: null, lon: null })).rejects.toThrow(/already a category/);
  });

  it("is refused a PIN that is not six digits by the database", async () => {
    const district = await newDistrict();
    const text = await captureErrorText(
      dbs.staff.db.insert(geoAreas).values({ districtId: district, slug: "bad", name: "Bad", citySlug: "pune", cityName: "Pune", pincodes: ["12345"] }),
    );
    expect(text).toMatch(/geo_areas_pincodes_check/);
  });
});

describe("categories", () => {
  it("adds a category and a sub-category, and keeps depth to one level", async () => {
    await createGeoCategory(dbs.staff.db, { slug: "coaching-centers", label: "Coaching Centers", singular: "Coaching Center", parentSlug: null, keywords: [], hasPage: true });
    const sub = await createGeoCategory(dbs.staff.db, { slug: "jee-coaching", label: "JEE Coaching", singular: "JEE Coaching", parentSlug: "coaching-centers", keywords: ["jee"], hasPage: false });
    await expect(
      createGeoCategory(dbs.staff.db, { slug: "deep", label: "Deep", singular: "Deep", parentSlug: "jee-coaching", keywords: [], hasPage: false }),
    ).rejects.toThrow(/cannot have sub-categories/);
    await expect(
      createGeoCategory(dbs.staff.db, { slug: "orphan", label: "Orphan", singular: "Orphan", parentSlug: "nope", keywords: [], hasPage: false }),
    ).rejects.toThrow(/no category "nope"/);
    await updateGeoCategory(dbs.staff.db, sub, { status: "on" });
    await expect(updateGeoCategory(dbs.staff.db, sub, { slug: "iit-coaching" })).rejects.toThrow(/permanent/);
  });

  it("switches a category off without losing it", async () => {
    const id = await createGeoCategory(dbs.staff.db, { slug: "tailors", label: "Tailors", singular: "Tailor", parentSlug: null, keywords: [], hasPage: false });
    await updateGeoCategory(dbs.staff.db, id, { status: "on" });
    await updateGeoCategory(dbs.staff.db, id, { status: "off" });
    const snapshot = await loadGeoCatalog(dbs.staff.db);
    expect(snapshot.categories.find((c) => c.slug === "tailors")?.status).toBe("off");
  });
});

describe("loading", () => {
  it("returns districts with their areas and the admin counts", async () => {
    const district = await newDistrict();
    const area = await createGeoArea(dbs.staff.db, { districtId: district, slug: "baner", name: "Baner", citySlug: "pune", cityName: "Pune", pincodes: [], lat: null, lon: null });
    await updateGeoArea(dbs.staff.db, area, { status: "on" });
    const snapshot = await loadGeoCatalog(dbs.staff.db);
    expect(snapshot.areas).toEqual([expect.objectContaining({ stateCode: "mh", districtSlug: "pune", slug: "baner", status: "on" })]);
    const admin = await loadGeoAdminCatalog(dbs.staff.db);
    expect(admin.districts[0]).toMatchObject({ slug: "pune", areaCount: 1, slugLocked: false });
    expect(admin.areas[0]).toMatchObject({ slug: "baner", slugLocked: true });
  });

  it("is readable by the customer connection but not writable", async () => {
    await newDistrict();
    expect((await dbs.app.db.select().from(geoDistricts)).length).toBe(1);
    const text = await captureErrorText(dbs.app.db.insert(geoDistricts).values({ stateCode: "mh", slug: "x", name: "X" }));
    expect(describeError(new Error(text))).toMatch(/permission denied/);
  });
});

