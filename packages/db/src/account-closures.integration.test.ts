import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findOpenClosureForUser,
  insertExitFeedback,
  listExitFeedback,
  markCancelRequested,
  openAccountClosure,
  restoreAccountClosure,
  summariseExitFeedback,
} from "./queries/account-closures";
import { isPackageOfferForfeited } from "./queries/bundled-add-ons";
import { findActivePlan, findLatestSubscriptionForBusiness, insertSubscription, type Plan } from "./queries/billing";
import { accountClosures, accountExitFeedback, businesses, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const USER_ID = "closing-user";
const NOW = new Date("2026-10-06T12:00:00.000Z");
const ERASE_AFTER = new Date("2026-11-05T12:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

beforeAll(async () => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: USER_ID, name: "Meera", email: "meera@example.com", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "aster-physio", name: "Aster Physio", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  const active = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (active === null) throw new Error("No active INR plan was seeded");
  plan = active;
});

describe("account closures", () => {
  it("opens one closure and returns it again when asked twice, without moving the date", async () => {
    const first = await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });
    const second = await openAccountClosure(dbs.staff.db, {
      userId: USER_ID,
      businessId,
      now: new Date("2026-10-07T12:00:00.000Z"),
      eraseAfter: new Date("2026-12-01T00:00:00.000Z"),
    });
    expect(second.id).toBe(first.id);
    expect(second.eraseAfter).toEqual(ERASE_AFTER);
    expect(await dbs.owner.db.select().from(accountClosures)).toHaveLength(1);
  });

  it("finds a user's open closure, and none for anyone else", async () => {
    expect(await findOpenClosureForUser(dbs.staff.db, USER_ID)).toBeNull();
    await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });
    expect(await findOpenClosureForUser(dbs.staff.db, USER_ID)).toMatchObject({ userId: USER_ID, businessId });
    expect(await findOpenClosureForUser(dbs.staff.db, "someone-else")).toBeNull();
  });

  it("restores a closure once, after which the account is open and may close again", async () => {
    await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });
    expect(await restoreAccountClosure(dbs.staff.db, { userId: USER_ID, now: NOW })).toBe(true);
    expect(await restoreAccountClosure(dbs.staff.db, { userId: USER_ID, now: NOW })).toBe(false);
    expect(await findOpenClosureForUser(dbs.staff.db, USER_ID)).toBeNull();

    await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });
    expect(await findOpenClosureForUser(dbs.staff.db, USER_ID)).not.toBeNull();
    expect(await dbs.owner.db.select().from(accountClosures)).toHaveLength(2);
  });

  it("refuses an erase date that is not after the request", async () => {
    const text = await captureErrorText(openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: NOW }));
    expect(text).toContain("account_closures_erase_after_check");
  });

  it("is invisible to the customer's own database role", async () => {
    await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });
    const text = await captureErrorText(dbs.app.db.select().from(accountClosures));
    expect(text).toContain("permission denied");
  });
});

describe("exit feedback", () => {
  it("keeps a reason and comment with no user or business on it", async () => {
    await insertExitFeedback(dbs.staff.db, {
      reason: "too_expensive",
      comment: "A little more than I can carry right now.",
      planCode: plan.code,
      offerPercent: null,
      outcome: "deleted",
    });
    const rows = await dbs.owner.db.select().from(accountExitFeedback);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {})).not.toContain("userId");
    expect(Object.keys(rows[0] ?? {})).not.toContain("businessId");
  });

  it("refuses keeping the account unless an offer was shown", async () => {
    const text = await captureErrorText(
      insertExitFeedback(dbs.staff.db, { reason: "other", comment: null, planCode: null, offerPercent: null, outcome: "kept_with_offer" }),
    );
    expect(text).toContain("account_exit_feedback_kept_check");
  });

  it("refuses a blank or oversized comment", async () => {
    const blank = await captureErrorText(
      insertExitFeedback(dbs.staff.db, { reason: "other", comment: "  ", planCode: null, offerPercent: null, outcome: "deleted" }),
    );
    expect(blank).toContain("account_exit_feedback_comment_check");
    const long = await captureErrorText(
      insertExitFeedback(dbs.staff.db, { reason: "other", comment: "x".repeat(1001), planCode: null, offerPercent: null, outcome: "deleted" }),
    );
    expect(long).toContain("account_exit_feedback_comment_check");
  });
});

describe("what staff read", () => {
  it("lists feedback newest first and summarises it, with the accounts still waiting to be erased", async () => {
    const give = (reason: "too_expensive" | "other", outcome: "deleted" | "kept_with_offer", comment: string | null) =>
      insertExitFeedback(dbs.staff.db, { reason, comment, planCode: plan.code, offerPercent: outcome === "kept_with_offer" ? 30 : null, outcome });
    await give("too_expensive", "kept_with_offer", null);
    await give("too_expensive", "deleted", "Too dear");
    await give("other", "deleted", null);
    await openAccountClosure(dbs.staff.db, { userId: USER_ID, businessId, now: NOW, eraseAfter: ERASE_AFTER });

    const rows = await listExitFeedback(dbs.staff.db, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.reason).toBe("other");

    expect(await summariseExitFeedback(dbs.staff.db)).toEqual({
      total: 3,
      deleted: 2,
      keptWithOffer: 1,
      byReason: [
        { reason: "too_expensive", count: 2 },
        { reason: "other", count: 1 },
      ],
      waitingToErase: 1,
    });
  });

  it("is empty before anyone has left, and refuses a nonsense limit", async () => {
    expect(await summariseExitFeedback(dbs.staff.db)).toEqual({ total: 0, deleted: 0, keptWithOffer: 0, byReason: [], waitingToErase: 0 });
    await expect(listExitFeedback(dbs.staff.db, 0)).rejects.toThrow(RangeError);
  });
});

describe("a subscription of a leaving business", () => {
  async function liveSubscription(): Promise<string> {
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_000000000000000000000001",
      referralCodeId: null,
      discountAmountCents: 0,
    });
    return subscription.id;
  }

  it("refuses ids that are not UUIDs without touching the database", async () => {
    expect(await markCancelRequested(dbs.staff.db, { subscriptionId: "nope", businessId, now: NOW })).toBe(false);
  });

  it("keeps the database's own rule: a discount that is neither a code's nor an offer's is refused", async () => {
    const subscriptionId = await liveSubscription();
    const text = await captureErrorText(
      dbs.owner.db.execute(`update subscriptions set discount_amount_cents = 500 where id = '${subscriptionId}'`),
    );
    expect(text).toContain("subscriptions_discount_check");
  });

  it("ends the package offer and the ad credit when the cancel request is noted, for good", async () => {
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_000000000000000000000002",
      referralCodeId: null,
      discountAmountCents: 0,
      adCreditCents: 500_000,
    });
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);

    await markCancelRequested(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: NOW });

    expect((await findLatestSubscriptionForBusiness(dbs.staff.db, businessId))?.adCreditCents).toBe(0);
    const [business] = await dbs.owner.db.select({ at: businesses.packageOfferForfeitedAt }).from(businesses).where(eq(businesses.id, businessId));
    expect(business?.at).toEqual(NOW);

    await markCancelRequested(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: new Date("2026-10-09T00:00:00.000Z") });
    const [again] = await dbs.owner.db.select({ at: businesses.packageOfferForfeitedAt }).from(businesses).where(eq(businesses.id, businessId));
    expect(again?.at).toEqual(NOW);
  });

  it("notes a cancel request once and keeps the first time", async () => {
    const subscriptionId = await liveSubscription();
    await markCancelRequested(dbs.staff.db, { subscriptionId, businessId, now: NOW });
    await markCancelRequested(dbs.staff.db, { subscriptionId, businessId, now: new Date("2026-10-09T00:00:00.000Z") });
    const subscription = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    expect(subscription?.cancelRequestedAt).toEqual(NOW);
    expect((await dbs.owner.db.select().from(accountClosures).where(eq(accountClosures.userId, USER_ID))).length).toBe(0);
  });
});
