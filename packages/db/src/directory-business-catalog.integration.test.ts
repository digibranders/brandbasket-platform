import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addBusinessFaq,
  addBusinessProduct,
  addBusinessService,
  clearBusinessProductPhoto,
  deleteBusinessFaq,
  deleteBusinessProduct,
  findLiveProductPhotoFile,
  findPreviewProductPhotoFile,
  findOwnProductPhotoFile,
  listBusinessProductPhotoIds,
  setBusinessProductPhoto,
  deleteBusinessService,
  listBusinessFaqs,
  listBusinessProducts,
  listBusinessServices,
  updateBusinessFaq,
  updateBusinessProduct,
  updateBusinessService,
} from "./queries/directory-business-catalog";
import { createListingAccountBusiness, createUnlistedAccountBusiness, decideDirectoryClaim } from "./queries/directory-ads";
import { eq } from "drizzle-orm";
import { businessUrlCode } from "./place-id";
import { BUSINESS_CATALOG_MAX_ITEMS, BUSINESS_FAQ_MAX_ITEMS, directoryClaims, directoryPlaces, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, execSql, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-catalog";
const OTHER = "owner-other";

const CLEANING = { category: "Cleaning", name: "Teeth scaling", summary: "Removes plaque and stains", description: "Ultrasonic.", priceInr: 1500, durationMinutes: 45, serviceArea: null };
const BRUSH = { name: "Electric toothbrush", description: null, priceInr: 2499, category: "Oral care", availability: "in_stock" } as const;

const DELIVERY = { question: "Do you deliver?", answer: "Yes, within 5 km.\nFree above ₹500." };

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Owner", email: "owner@example.com", emailVerified: true },
    { id: OTHER, name: "Other", email: "other@example.com", emailVerified: true },
  ]);
});

async function newAccount(userId: string): Promise<string> {
  return (await createUnlistedAccountBusiness(dbs.staff.db, { userId, businessName: "Account" })).businessId;
}

describe("services", () => {
  it("adds, lists in order, updates and deletes, for the business named", async () => {
    const businessId = await newAccount(OWNER);
    const first = await addBusinessService(dbs.staff.db, { businessId, service: CLEANING });
    const second = await addBusinessService(dbs.staff.db, { businessId, service: { ...CLEANING, name: "Whitening", priceInr: null } });
    if (first.kind !== "saved" || second.kind !== "saved") throw new Error("Both services should have been saved.");

    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listBusinessServices(tx, businessId));
    expect(own.map((service) => service.name)).toEqual(["Teeth scaling", "Whitening"]);
    expect(own[1]?.priceInr).toBeNull();

    expect(await updateBusinessService(dbs.staff.db, { businessId, id: first.id, service: { ...CLEANING, name: "Deep scaling", priceInr: 1800 } })).toEqual({
      kind: "saved",
      id: first.id,
    });
    expect((await listBusinessServices(dbs.staff.db, businessId))[0]).toMatchObject({ name: "Deep scaling", priceInr: 1800 });

    expect(await deleteBusinessService(dbs.staff.db, { businessId, id: second.id })).toBe(true);
    expect(await deleteBusinessService(dbs.staff.db, { businessId, id: second.id })).toBe(false);
    expect(await listBusinessServices(dbs.staff.db, businessId)).toHaveLength(1);
  });

  it("never changes or removes another business's service", async () => {
    const mine = await newAccount(OWNER);
    const theirs = await newAccount(OTHER);
    const added = await addBusinessService(dbs.staff.db, { businessId: theirs, service: CLEANING });
    if (added.kind !== "saved") throw new Error("The service should have been saved.");

    expect(await updateBusinessService(dbs.staff.db, { businessId: mine, id: added.id, service: { ...CLEANING, name: "Hijacked" } })).toEqual({ kind: "not-found" });
    expect(await deleteBusinessService(dbs.staff.db, { businessId: mine, id: added.id })).toBe(false);
    expect((await listBusinessServices(dbs.staff.db, theirs))[0]?.name).toBe("Teeth scaling");
  });

  it("is readable by its own business alone", async () => {
    const mine = await newAccount(OWNER);
    const theirs = await newAccount(OTHER);
    await addBusinessService(dbs.staff.db, { businessId: theirs, service: CLEANING });
    const peek = await withTenantScope(dbs.app.db, { userId: OWNER, businessId: mine }, (tx) => listBusinessServices(tx, theirs));
    expect(peek).toEqual([]);
  });

  it(`stops at ${String(BUSINESS_CATALOG_MAX_ITEMS)} services`, async () => {
    const businessId = await newAccount(OWNER);
    for (let index = 0; index < BUSINESS_CATALOG_MAX_ITEMS; index += 1) {
      const outcome = await addBusinessService(dbs.staff.db, { businessId, service: { ...CLEANING, name: `Service ${String(index)}` } });
      expect(outcome.kind).toBe("saved");
    }
    expect(await addBusinessService(dbs.staff.db, { businessId, service: CLEANING })).toEqual({ kind: "full" });
  });

  it("refuses what the database's checks do not allow", async () => {
    const businessId = await newAccount(OWNER);
    await expect(addBusinessService(dbs.staff.db, { businessId, service: { ...CLEANING, priceInr: -1 } })).rejects.toThrow();
    await expect(addBusinessService(dbs.staff.db, { businessId, service: { ...CLEANING, durationMinutes: 0 } })).rejects.toThrow();
    await expect(addBusinessService(dbs.staff.db, { businessId, service: { ...CLEANING, name: "two\nlines" } })).rejects.toThrow();
  });
});

describe("products", () => {
  it("adds, updates and deletes, keeping availability", async () => {
    const businessId = await newAccount(OWNER);
    const added = await addBusinessProduct(dbs.staff.db, { businessId, product: BRUSH });
    if (added.kind !== "saved") throw new Error("The product should have been saved.");

    expect(await updateBusinessProduct(dbs.staff.db, { businessId, id: added.id, product: { ...BRUSH, availability: "out_of_stock" } })).toEqual({
      kind: "saved",
      id: added.id,
    });
    expect(await listBusinessProducts(dbs.staff.db, businessId)).toEqual([{ id: added.id, ...BRUSH, availability: "out_of_stock", photoId: null }]);
    expect(await deleteBusinessProduct(dbs.staff.db, { businessId, id: added.id })).toEqual({ deleted: true, photoId: null });
    expect(await listBusinessProducts(dbs.staff.db, businessId)).toEqual([]);
  });

  it("refuses an unknown availability", async () => {
    const businessId = await newAccount(OWNER);
    await expect(addBusinessProduct(dbs.staff.db, { businessId, product: { ...BRUSH, availability: "maybe" as never } })).rejects.toThrow();
  });

  it("is readable by its own business alone", async () => {
    const mine = await newAccount(OWNER);
    const theirs = await newAccount(OTHER);
    await addBusinessProduct(dbs.staff.db, { businessId: theirs, product: BRUSH });
    const peek = await withTenantScope(dbs.app.db, { userId: OWNER, businessId: mine }, (tx) => listBusinessProducts(tx, theirs));
    expect(peek).toEqual([]);
  });
});

describe("faqs", () => {
  it("adds, lists in order, updates and deletes, for the business named", async () => {
    const businessId = await newAccount(OWNER);
    const first = await addBusinessFaq(dbs.staff.db, { businessId, faq: DELIVERY });
    const second = await addBusinessFaq(dbs.staff.db, { businessId, faq: { question: "Do you take walk-ins?", answer: "Yes." } });
    if (first.kind !== "saved" || second.kind !== "saved") throw new Error("Both questions should have been saved.");

    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listBusinessFaqs(tx, businessId));
    expect(own).toEqual([
      { id: first.id, ...DELIVERY },
      { id: second.id, question: "Do you take walk-ins?", answer: "Yes." },
    ]);

    expect(await updateBusinessFaq(dbs.staff.db, { businessId, id: first.id, faq: { ...DELIVERY, answer: "Only in Thane." } })).toEqual({ kind: "saved", id: first.id });
    expect((await listBusinessFaqs(dbs.staff.db, businessId))[0]?.answer).toBe("Only in Thane.");

    expect(await deleteBusinessFaq(dbs.staff.db, { businessId, id: second.id })).toBe(true);
    expect(await deleteBusinessFaq(dbs.staff.db, { businessId, id: second.id })).toBe(false);
    expect(await listBusinessFaqs(dbs.staff.db, businessId)).toHaveLength(1);
  });

  it("never changes or removes another business's question", async () => {
    const mine = await newAccount(OWNER);
    const theirs = await newAccount(OTHER);
    const added = await addBusinessFaq(dbs.staff.db, { businessId: theirs, faq: DELIVERY });
    if (added.kind !== "saved") throw new Error("The question should have been saved.");

    expect(await updateBusinessFaq(dbs.staff.db, { businessId: mine, id: added.id, faq: { ...DELIVERY, answer: "Hijacked" } })).toEqual({ kind: "not-found" });
    expect(await deleteBusinessFaq(dbs.staff.db, { businessId: mine, id: added.id })).toBe(false);
    expect((await listBusinessFaqs(dbs.staff.db, theirs))[0]?.answer).toBe(DELIVERY.answer);
  });

  it("is readable by its own business alone", async () => {
    const mine = await newAccount(OWNER);
    const theirs = await newAccount(OTHER);
    await addBusinessFaq(dbs.staff.db, { businessId: theirs, faq: DELIVERY });
    const peek = await withTenantScope(dbs.app.db, { userId: OWNER, businessId: mine }, (tx) => listBusinessFaqs(tx, theirs));
    expect(peek).toEqual([]);
  });

  it(`stops at ${String(BUSINESS_FAQ_MAX_ITEMS)} questions`, async () => {
    const businessId = await newAccount(OWNER);
    for (let index = 0; index < BUSINESS_FAQ_MAX_ITEMS; index += 1) {
      const outcome = await addBusinessFaq(dbs.staff.db, { businessId, faq: { ...DELIVERY, question: `Question ${String(index)}?` } });
      expect(outcome.kind).toBe("saved");
    }
    expect(await addBusinessFaq(dbs.staff.db, { businessId, faq: DELIVERY })).toEqual({ kind: "full" });
  });

  it("refuses what the database's checks do not allow", async () => {
    const businessId = await newAccount(OWNER);
    await expect(addBusinessFaq(dbs.staff.db, { businessId, faq: { ...DELIVERY, question: "two\nlines" } })).rejects.toThrow();
    await expect(addBusinessFaq(dbs.staff.db, { businessId, faq: { ...DELIVERY, answer: " padded " } })).rejects.toThrow();
    await expect(addBusinessFaq(dbs.staff.db, { businessId, faq: { ...DELIVERY, answer: "" } })).rejects.toThrow();
  });
});

describe("product photos", () => {
  const PHOTO_A = "0192f3c4-aaaa-7000-8000-00000000000a";
  const PHOTO_B = "0192f3c4-bbbb-7000-8000-00000000000b";
  const SHA = "c".repeat(64);
  const photo = (photoId: string) => ({ photoId, mimeType: "image/webp", bytes: 30_000, width: 800, height: 800, sha256: SHA });

  beforeEach(async () => {
    await dbs.staff.db.insert(users).values({ id: "staff-1", name: "Staff", email: "staff@example.com" });
  });

  async function listedBusiness(userId: string, key: string): Promise<{ readonly businessId: string; readonly claimId: string }> {
    return createListingAccountBusiness(dbs.staff.db, { userId, listingKey: key, businessName: "Clinic", phone: "+919820000010" });
  }

  async function newProduct(businessId: string): Promise<string> {
    const added = await addBusinessProduct(dbs.staff.db, { businessId, product: BRUSH });
    if (added.kind !== "saved") throw new Error("The product should have been saved.");
    return added.id;
  }

  it("starts without a photo, and a photo set on a product shows in its listing", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    expect((await listBusinessProducts(dbs.staff.db, businessId))[0]?.photoId).toBeNull();

    expect(await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) })).toEqual({ kind: "saved", replacedPhotoId: null });
    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listBusinessProducts(tx, businessId));
    expect(own[0]?.photoId).toBe(PHOTO_A);
    expect(await listBusinessProductPhotoIds(dbs.staff.db, businessId)).toEqual([PHOTO_A]);
  });

  it("replaces a photo and says which one it replaced, so its file can go", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) });
    expect(await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_B) })).toEqual({ kind: "saved", replacedPhotoId: PHOTO_A });
    expect(await findOwnProductPhotoFile(dbs.staff.db, businessId, PHOTO_A)).toBeNull();
    expect(await findOwnProductPhotoFile(dbs.staff.db, businessId, PHOTO_B)).toEqual({
      storageKey: `t/${businessId}/${PHOTO_B}/display`,
      mimeType: "image/webp",
      sha256: SHA,
    });
  });

  it("does not put a photo on another business's product", async () => {
    const mine = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const theirs = await listedBusiness(OTHER, "dentists/thane/naupada/clinic-b");
    const theirProduct = await newProduct(theirs.businessId);
    expect(await setBusinessProductPhoto(dbs.staff.db, { businessId: mine.businessId, productId: theirProduct, photo: photo(PHOTO_A) })).toEqual({ kind: "not-found" });
    expect((await listBusinessProducts(dbs.staff.db, theirs.businessId))[0]?.photoId).toBeNull();
  });

  it("shows a photo to its own business only, and to the website only once the listing is approved", async () => {
    const mine = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const theirs = await listedBusiness(OTHER, "dentists/thane/naupada/clinic-b");
    const productId = await newProduct(mine.businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId: mine.businessId, productId, photo: photo(PHOTO_A) });

    expect(await findOwnProductPhotoFile(dbs.staff.db, theirs.businessId, PHOTO_A)).toBeNull();
    expect(await findOwnProductPhotoFile(dbs.staff.db, mine.businessId, "not-an-id")).toBeNull();
    expect(await findLiveProductPhotoFile(dbs.staff.db, PHOTO_A)).toBeNull();

    await decideDirectoryClaim(dbs.staff.db, { claimId: mine.claimId, approve: true, staffId: "staff-1", now: new Date("2026-10-12T06:30:00.000Z") });
    expect(await findLiveProductPhotoFile(dbs.staff.db, PHOTO_A)).toEqual({
      storageKey: `t/${mine.businessId}/${PHOTO_A}/display`,
      mimeType: "image/webp",
      sha256: SHA,
    });
    expect(await findLiveProductPhotoFile(dbs.staff.db, "not-an-id")).toBeNull();
  });

  it("shows a photo to the owner's live preview of a page that is not live yet, for that page's address only", async () => {
    const mine = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(mine.businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId: mine.businessId, productId, photo: photo(PHOTO_A) });
    await dbs.staff.db.insert(directoryPlaces).values({ id: "6sunr2s", origin: "client", stateCode: "mh", citySlug: "thane", urlSlug: "clinic-a" });
    await dbs.staff.db.update(directoryClaims).set({ placeId: "6sunr2s" }).where(eq(directoryClaims.businessId, mine.businessId));
    const code = businessUrlCode("6sunr2s");

    // The claim is still waiting: the website's ordinary route is refused the photo, the preview is not.
    expect(await findLiveProductPhotoFile(dbs.staff.db, PHOTO_A)).toBeNull();
    expect(await findPreviewProductPhotoFile(dbs.staff.db, PHOTO_A, code)).toEqual({
      storageKey: `t/${mine.businessId}/${PHOTO_A}/display`,
      mimeType: "image/webp",
      sha256: SHA,
    });
    expect(await findPreviewProductPhotoFile(dbs.staff.db, PHOTO_A, "zzzzzzzzzz")).toBeNull();
    expect(await findPreviewProductPhotoFile(dbs.staff.db, "not-an-id", code)).toBeNull();
  });

  it("takes a photo off, once, and returns its id", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) });
    expect(await clearBusinessProductPhoto(dbs.staff.db, { businessId, productId })).toBe(PHOTO_A);
    expect(await clearBusinessProductPhoto(dbs.staff.db, { businessId, productId })).toBeNull();
    expect((await listBusinessProducts(dbs.staff.db, businessId))[0]?.photoId).toBeNull();
  });

  it("returns the photo of a product that is deleted", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) });
    expect(await deleteBusinessProduct(dbs.staff.db, { businessId, id: productId })).toEqual({ deleted: true, photoId: PHOTO_A });
    expect(await deleteBusinessProduct(dbs.staff.db, { businessId, id: productId })).toEqual({ deleted: false, photoId: null });
  });

  it("keeps every photo accounted for when uploads to one product land at the same time", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    const ids = Array.from({ length: 6 }, (_unused, index) => `0192f3c4-cccc-7000-8000-00000000000${String(index)}`);
    const outcomes = await Promise.all(ids.map((photoId) => setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(photoId) })));

    const replaced = outcomes.flatMap((outcome) => (outcome.kind === "saved" && outcome.replacedPhotoId !== null ? [outcome.replacedPhotoId] : []));
    const final = (await listBusinessProducts(dbs.staff.db, businessId))[0]?.photoId;
    if (final === null || final === undefined) throw new Error("The product should end with a photo.");
    // Each photo but the last was handed back exactly once, for its file to be deleted; none was lost and none handed back twice.
    expect([...replaced, final].sort()).toEqual([...ids].sort());
    expect(new Set(replaced).size).toBe(replaced.length);
  });

  it("never leaves a photo without an owner when an upload and a delete of its product race", async () => {
    for (let round = 0; round < 8; round += 1) {
      const racer = `race-${String(round)}`;
      await dbs.staff.db.insert(users).values({ id: racer, name: "Racer", email: `${racer}@example.com`, emailVerified: true });
      const { businessId } = await listedBusiness(racer, `dentists/thane/naupada/${racer}`);
      const productId = await newProduct(businessId);
      const [set, deleted] = await Promise.all([
        setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) }),
        deleteBusinessProduct(dbs.staff.db, { businessId, id: productId }),
      ]);
      expect(deleted.deleted).toBe(true);
      // Either the photo went on first and the delete handed it back, or the product was already gone and the upload was told so.
      if (set.kind === "saved") expect(deleted.photoId).toBe(PHOTO_A);
      else expect(deleted.photoId).toBeNull();
      expect(await listBusinessProductPhotoIds(dbs.staff.db, businessId)).toEqual([]);
    }
  });

  it("does not take another business's photo off when asked with its product id", async () => {
    const mine = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const theirs = await listedBusiness(OTHER, "dentists/thane/naupada/clinic-b");
    const theirProduct = await newProduct(theirs.businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId: theirs.businessId, productId: theirProduct, photo: photo(PHOTO_A) });
    expect(await clearBusinessProductPhoto(dbs.staff.db, { businessId: mine.businessId, productId: theirProduct })).toBeNull();
    expect(await deleteBusinessProduct(dbs.staff.db, { businessId: mine.businessId, id: theirProduct })).toEqual({ deleted: false, photoId: null });
    expect((await listBusinessProducts(dbs.staff.db, theirs.businessId))[0]?.photoId).toBe(PHOTO_A);
  });

  it("keeps the photo when the product's details are edited", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: photo(PHOTO_A) });
    await updateBusinessProduct(dbs.staff.db, { businessId, id: productId, product: { ...BRUSH, name: "Renamed", priceInr: null, category: null } });
    expect((await listBusinessProducts(dbs.staff.db, businessId))[0]).toMatchObject({ name: "Renamed", priceInr: null, photoId: PHOTO_A });
  });

  it("refuses the same photo id on two products", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const first = await newProduct(businessId);
    const second = await newProduct(businessId);
    await setBusinessProductPhoto(dbs.staff.db, { businessId, productId: first, photo: photo(PHOTO_A) });
    const error = await captureErrorText(setBusinessProductPhoto(dbs.staff.db, { businessId, productId: second, photo: photo(PHOTO_A) }));
    expect(error).toContain("directory_business_products_photo_id_idx");
  });

  it("refuses a photo that claims no size", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    const error = await captureErrorText(setBusinessProductPhoto(dbs.staff.db, { businessId, productId, photo: { ...photo(PHOTO_A), width: 0 } }));
    expect(error).toContain("directory_business_products_photo_check");
  });

  it("refuses a half-recorded photo", async () => {
    const { businessId } = await listedBusiness(OWNER, "dentists/thane/naupada/clinic-a");
    const productId = await newProduct(businessId);
    const error = await captureErrorText(execSql(dbs.owner, `update directory_business_products set photo_id = '${PHOTO_A}' where id = '${productId}'`));
    expect(error).toContain("directory_business_products_photo_check");
  });
});
