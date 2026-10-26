import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findChargeForBusiness, recordChargePayment, waiveCharge } from "./queries/charges";
import { saveListingPlacement, type ListingPlacementInput } from "./queries/directory-listings";
import { createPlatformPlace } from "./queries/directory-places";
import {
  findOpenPromotionCharge,
  findRunningDirectoryPromotion,
  listUpcomingDirectoryPromotions,
  openListingPromotionCharge,
  readActiveDirectoryPaidTags,
  setOwnDirectoryPromotionVisible,
  startDirectoryPromotionForCharge,
  type OpenPromotionChargeInput,
} from "./queries/directory-promotions";
import { businesses, businessMembers, charges, directoryListings, directoryPromotions, users, type DirectoryPaidTag } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import type { DirectoryLookup } from "./queries/directory-refs";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF = "staff-1";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const NOW = new Date("2026-10-01T06:30:00.000Z");
/** ₹299, with the 18% GST inside it: a week is charged at its price. */
const PRICE = 29_900;

const PLACEMENT: ListingPlacementInput = {
  categorySlug: "dentists",
  stateCode: "mh",
  citySlug: "thane",
  areaSlug: "naupada",
  slug: "smile-dental-clinic",
  lat: 19.19,
  lon: 72.97,
  pinLabel: "Gokhale Road, near Thane station",
  whatsappPhone: null,
  bookingUrl: null,
  replacesSourcePath: null,
  takeOverPlaceId: null,
};
const KEY_A = "dentists/thane/naupada/smile-dental-clinic";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let paymentCounter = 0;

function byKeys(listingKeys: readonly string[]): DirectoryLookup {
  return { placeIds: [], unplacedKeys: listingKeys };
}

function asA<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, work);
}

function asB<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, work);
}

function promotionInput(businessId: string, tag: DirectoryPaidTag, now: Date): OpenPromotionChargeInput {
  return {
    businessId,
    tag,
    description: `${tag} listing tag, 7 days`,
    unitAmountCents: PRICE,
    taxRateBasisPoints: 1800,
    amountCents: PRICE,
    now,
  };
}

async function openCharge(businessId: string, tag: DirectoryPaidTag, now: Date): Promise<string> {
  const outcome = await openListingPromotionCharge(dbs.staff.db, promotionInput(businessId, tag, now));
  if (outcome.kind !== "opened") throw new Error(`Expected an open charge, got ${outcome.reason}`);
  return outcome.chargeId;
}

/** Records a fake-provider payment for the charge, as the payment confirmation does. */
async function pay(chargeId: string, businessId: string, now: Date, providerPaymentId?: string) {
  paymentCounter += 1;
  return recordChargePayment(dbs.staff.db, {
    chargeId,
    businessId,
    provider: "fake",
    providerPaymentId: providerPaymentId ?? `pay_promo_${paymentCounter}`,
    amountCents: PRICE,
    currency: "INR",
    paidAt: now,
    now,
  });
}

/** Buys and pays one week, returning the charge id. */
async function buyWeek(businessId: string, tag: DirectoryPaidTag, now: Date): Promise<string> {
  const chargeId = await openCharge(businessId, tag, now);
  const recorded = await pay(chargeId, businessId, now);
  expect(recorded.outcome).toBe("paid");
  return chargeId;
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
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "smile-dental", name: "Smile Dental Clinic", currency: "INR" },
      { slug: "harbour-salon", name: "Harbour Salon", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "smile-dental")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "harbour-salon")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
});

describe("opening a promotion charge", () => {
  it("adds one open listing_promotion charge at the week's price, for the customer to read", async () => {
    const chargeId = await openCharge(businessA, "hot_new", NOW);

    const charge = await findChargeForBusiness(dbs.staff.db, businessA, chargeId);
    expect(charge).toMatchObject({
      kind: "listing_promotion",
      status: "open",
      quantity: 1,
      unitAmountCents: PRICE,
      taxRateBasisPoints: 1800,
      amountCents: PRICE,
      currency: "INR",
      createdByStaffId: null,
    });
    expect(await asA((tx) => findOpenPromotionCharge(tx, businessA))).toEqual({
      chargeId,
      tag: "hot_new",
      amountCents: PRICE,
      currency: "INR",
    });
    expect(await asB((tx) => findOpenPromotionCharge(tx, businessA))).toBeNull();
  });

  it("reuses the open charge when the customer picks another tag before paying", async () => {
    const first = await openCharge(businessA, "hot_new", NOW);
    const second = await openCharge(businessA, "most_searched", NOW);

    expect(second).toBe(first);
    const rows = await dbs.staff.db.select().from(charges).where(eq(charges.businessId, businessA));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.promotionTag).toBe("most_searched");
    expect(rows[0]?.description).toBe("most_searched listing tag, 7 days");
  });

  it("starts nothing until the charge is paid", async () => {
    await openCharge(businessA, "hot_new", NOW);
    expect(await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, NOW)).toEqual([]);
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), NOW)).toEqual(new Map());
  });

  it("refuses a promotion charge without a tag, or in dollars", async () => {
    const base = {
      businessId: businessA,
      kind: "listing_promotion" as const,
      description: "Hot & New listing tag, 7 days",
      quantity: 1,
      unitAmountCents: PRICE,
      taxRateBasisPoints: 1800,
      amountCents: PRICE,
      currency: "INR" as const,
    };
    expect(await captureErrorText(dbs.staff.db.insert(charges).values(base))).toMatch(/charges_promotion_tag_check/);
    expect(
      await captureErrorText(dbs.staff.db.insert(charges).values({ ...base, promotionTag: "hot_new", currency: "USD" })),
    ).toMatch(/charges_promotion_currency_check/);
    expect(
      await captureErrorText(
        dbs.staff.db.insert(charges).values({ ...base, kind: "custom", promotionTag: "hot_new", description: "Other" }),
      ),
    ).toMatch(/charges_promotion_tag_check/);
  });
});

describe("paying for a week", () => {
  it("starts the tag when the payment is confirmed, for exactly seven days", async () => {
    const chargeId = await buyWeek(businessA, "hot_new", NOW);

    const upcoming = await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, NOW);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({ tag: "hot_new", chargeId, visible: true, startsAt: NOW });
    expect(upcoming[0]?.endsAt).toEqual(new Date(NOW.getTime() + WEEK_MS));
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), NOW)).toEqual(new Map([[KEY_A, "hot_new"]]));
    expect((await findChargeForBusiness(dbs.staff.db, businessA, chargeId))?.status).toBe("paid");
  });

  it("starts one week however often the same payment is confirmed", async () => {
    const chargeId = await openCharge(businessA, "hot_new", NOW);
    await pay(chargeId, businessA, NOW, "pay_same");
    const again = await pay(chargeId, businessA, new Date(NOW.getTime() + 60_000), "pay_same");
    expect(again.alreadyRecorded).toBe(true);

    const startedAgain = await dbs.staff.db.transaction((tx) =>
      startDirectoryPromotionForCharge(tx, { chargeId, businessId: businessA, tag: "hot_new", now: NOW }),
    );
    expect(startedAgain.chargeId).toBe(chargeId);
    expect(await dbs.staff.db.select().from(directoryPromotions)).toHaveLength(1);
  });

  it("does not start a week for a payment that does not match the charge", async () => {
    const chargeId = await openCharge(businessA, "hot_new", NOW);
    const recorded = await recordChargePayment(dbs.staff.db, {
      chargeId,
      businessId: businessA,
      provider: "fake",
      providerPaymentId: "pay_short",
      amountCents: PRICE - 1,
      currency: "INR",
      paidAt: NOW,
      now: NOW,
    });
    expect(recorded.outcome).toBe("amount-mismatch");
    expect(await dbs.staff.db.select().from(directoryPromotions)).toEqual([]);
  });

  it("starts nothing for a charge staff waived", async () => {
    const chargeId = await openCharge(businessA, "hot_new", NOW);
    expect(await waiveCharge(dbs.staff.db, { chargeId, businessId: businessA, staffId: STAFF, now: NOW })).toBe(true);
    expect((await pay(chargeId, businessA, NOW)).outcome).toBe("not-open");
    expect(await dbs.staff.db.select().from(directoryPromotions)).toEqual([]);
  });

  it("ends after seven days", async () => {
    await buyWeek(businessA, "most_searched", NOW);
    const lastMinute = new Date(NOW.getTime() + WEEK_MS - 60_000);
    const ended = new Date(NOW.getTime() + WEEK_MS);

    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), lastMinute)).toEqual(new Map([[KEY_A, "most_searched"]]));
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), ended)).toEqual(new Map());
    expect(await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, ended)).toEqual([]);
    expect(await findRunningDirectoryPromotion(dbs.staff.db, businessA, ended)).toBeNull();
  });
});

describe("renewing and the one-tag rule", () => {
  it("extends a renewal from the running week's end, not from the payment", async () => {
    await buyWeek(businessA, "hot_new", NOW);
    const fiveDaysOn = new Date(NOW.getTime() + 5 * DAY_MS);
    await buyWeek(businessA, "hot_new", fiveDaysOn);

    const weeks = await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, fiveDaysOn);
    expect(weeks.map((week) => [week.startsAt.getTime(), week.endsAt.getTime()])).toEqual([
      [NOW.getTime(), NOW.getTime() + WEEK_MS],
      [NOW.getTime() + WEEK_MS, NOW.getTime() + 2 * WEEK_MS],
    ]);
    const intoSecondWeek = new Date(NOW.getTime() + WEEK_MS + DAY_MS);
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), intoSecondWeek)).toEqual(new Map([[KEY_A, "hot_new"]]));
  });

  it("refuses a different tag while one is running, and a second booked week", async () => {
    await buyWeek(businessA, "hot_new", NOW);
    const later = new Date(NOW.getTime() + DAY_MS);

    expect(await openListingPromotionCharge(dbs.staff.db, promotionInput(businessA, "most_searched", later))).toEqual({
      kind: "refused",
      reason: "other-tag-running",
    });
    await buyWeek(businessA, "hot_new", later);
    expect(await openListingPromotionCharge(dbs.staff.db, promotionInput(businessA, "hot_new", later))).toEqual({
      kind: "refused",
      reason: "next-week-booked",
    });
    expect(await findOpenPromotionCharge(dbs.staff.db, businessA)).toBeNull();
  });

  it("allows any tag once the running week has ended", async () => {
    await buyWeek(businessA, "hot_new", NOW);
    const ended = new Date(NOW.getTime() + WEEK_MS);
    await buyWeek(businessA, "popular_near_you", ended);

    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), ended)).toEqual(new Map([[KEY_A, "popular_near_you"]]));
  });

  it("queues a week paid for under an older open charge behind the running one, never overlapping", async () => {
    // Opened while nothing ran, paid only after another week started: it follows that week instead of overlapping.
    const stale = await openCharge(businessA, "hot_new", NOW);
    await dbs.staff.db.update(charges).set({ status: "waived", waivedAt: NOW, waivedByStaffId: STAFF }).where(eq(charges.id, stale));
    await buyWeek(businessA, "hot_new", NOW);
    const late = await dbs.staff.db
      .insert(charges)
      .values({
        businessId: businessA,
        kind: "listing_promotion",
        promotionTag: "most_searched",
        description: "Most Searched listing tag, 7 days",
        quantity: 1,
        unitAmountCents: PRICE,
        taxRateBasisPoints: 1800,
        amountCents: PRICE,
        currency: "INR",
      })
      .returning({ id: charges.id });
    const lateId = late[0]?.id ?? "";
    await pay(lateId, businessA, new Date(NOW.getTime() + DAY_MS));

    const weeks = await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, NOW);
    expect(weeks.map((week) => week.tag)).toEqual(["hot_new", "most_searched"]);
    expect(weeks[1]?.startsAt).toEqual(weeks[0]?.endsAt);
  });

  it("refuses overlapping weeks from any writer", async () => {
    const chargeId = await buyWeek(businessA, "hot_new", NOW);
    const other = await dbs.staff.db
      .insert(charges)
      .values({
        businessId: businessA,
        kind: "custom",
        description: "Other",
        quantity: 1,
        unitAmountCents: 100,
        taxRateBasisPoints: 0,
        amountCents: 100,
        currency: "INR",
      })
      .returning({ id: charges.id });
    const overlapping = dbs.staff.db.insert(directoryPromotions).values({
      businessId: businessA,
      tag: "most_searched",
      startsAt: new Date(NOW.getTime() + DAY_MS),
      endsAt: new Date(NOW.getTime() + DAY_MS + WEEK_MS),
      chargeId: other[0]?.id ?? chargeId,
    });
    expect(await captureErrorText(overlapping)).toMatch(/already has a listing promotion/);
  });

  it("holds every week to exactly seven days", async () => {
    const chargeId = await buyWeek(businessA, "hot_new", NOW);
    const stretched = dbs.staff.db
      .update(directoryPromotions)
      .set({ endsAt: new Date(NOW.getTime() + 2 * WEEK_MS) })
      .where(eq(directoryPromotions.chargeId, chargeId));
    expect(await captureErrorText(stretched)).toMatch(/directory_promotions_week_check/);
  });
});

describe("the customer's switch", () => {
  it("hides the tag from the directory without shortening the paid week", async () => {
    await buyWeek(businessA, "hot_new", NOW);
    const later = new Date(NOW.getTime() + DAY_MS);

    expect(await asA((tx) => setOwnDirectoryPromotionVisible(tx, false, later))).toBe(1);
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), later)).toEqual(new Map());
    const weeks = await asA((tx) => listUpcomingDirectoryPromotions(tx, businessA, later));
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ visible: false, endsAt: new Date(NOW.getTime() + WEEK_MS) });

    expect(await asA((tx) => setOwnDirectoryPromotionVisible(tx, true, later))).toBe(1);
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), later)).toEqual(new Map([[KEY_A, "hot_new"]]));
  });

  it("keeps a renewal bought while hidden hidden", async () => {
    await buyWeek(businessA, "hot_new", NOW);
    await asA((tx) => setOwnDirectoryPromotionVisible(tx, false, NOW));
    await buyWeek(businessA, "hot_new", new Date(NOW.getTime() + DAY_MS));

    const weeks = await listUpcomingDirectoryPromotions(dbs.staff.db, businessA, NOW);
    expect(weeks.map((week) => week.visible)).toEqual([false, false]);
  });

  it("changes nothing when no week is running, and never another business's weeks", async () => {
    expect(await asA((tx) => setOwnDirectoryPromotionVisible(tx, false, NOW))).toBe(0);
    await buyWeek(businessA, "hot_new", NOW);
    expect(await asB((tx) => setOwnDirectoryPromotionVisible(tx, false, NOW))).toBe(0);
    expect(await asB((tx) => listUpcomingDirectoryPromotions(tx, businessA, NOW))).toEqual([]);
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A]), NOW)).toEqual(new Map([[KEY_A, "hot_new"]]));
  });

  it("lets the customer change only the switch, and never add or remove a week", async () => {
    const chargeId = await buyWeek(businessA, "hot_new", NOW);

    const retag = asA((tx) => tx.update(directoryPromotions).set({ tag: "most_searched" }));
    expect(await captureErrorText(retag)).toMatch(/permission denied/);
    const extend = asA((tx) => tx.update(directoryPromotions).set({ endsAt: new Date(NOW.getTime() + 2 * WEEK_MS) }));
    expect(await captureErrorText(extend)).toMatch(/permission denied/);
    const insert = asA((tx) =>
      tx.insert(directoryPromotions).values({
        businessId: businessA,
        tag: "hot_new",
        startsAt: new Date(NOW.getTime() + WEEK_MS),
        endsAt: new Date(NOW.getTime() + 2 * WEEK_MS),
        chargeId,
      }),
    );
    expect(await captureErrorText(insert)).toMatch(/permission denied/);
    const remove = asA((tx) => tx.delete(directoryPromotions));
    expect(await captureErrorText(remove)).toMatch(/permission denied/);
  });
});

describe("readActiveDirectoryPaidTags", () => {
  it("finds a listing by its place, and one with no place yet at its current or an earlier address", async () => {
    await buyWeek(businessA, "popular_near_you", NOW);
    await saveListingPlacement(dbs.staff.db, businessA, { ...PLACEMENT, areaSlug: "panch-pakhadi" }, NOW);
    const current = "dentists/thane/panch-pakhadi/smile-dental-clinic";
    const unknown = "salons/thane/kopri/glow-studio";

    // No place yet (before the backfill): found by its addresses, as before ids.
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, byKeys([KEY_A, current, unknown]), NOW)).toEqual(
      new Map<string, DirectoryPaidTag>([
        [KEY_A, "popular_near_you"],
        [current, "popular_near_you"],
      ]),
    );

    // With the place the backfill gives it, it is found by that place, and no longer by its address alone.
    const placeId = await createPlatformPlace(dbs.staff.db, { origin: "client", stateCode: "mh", citySlug: "thane", urlSlug: "smile-dental-clinic" }, NOW);
    await dbs.staff.db.update(directoryListings).set({ placeId }).where(eq(directoryListings.businessId, businessA));
    expect(await readActiveDirectoryPaidTags(dbs.staff.db, { placeIds: [placeId], unplacedKeys: [current] }, NOW)).toEqual(
      new Map<string, DirectoryPaidTag>([[placeId, "popular_near_you"]]),
    );
  });

  it("refuses more keys than one signals read allows", async () => {
    const keys = Array.from({ length: 51 }, (_, index) => `dentists/thane/naupada/clinic-${index}`);
    await expect(readActiveDirectoryPaidTags(dbs.staff.db, byKeys(keys), NOW)).rejects.toThrow(/At most 50/);
  });
});
