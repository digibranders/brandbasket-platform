import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { directoryEnquiries, directoryPlaces, directoryReviewComments, directoryReviewOtps, directoryReviews, directoryVisitors, users } from "./schema";
import { listOwnDirectoryContributions } from "./queries/directory-visitors";
import { deleteContributionForProvenNumber, listPrivacyRequests } from "./queries/privacy-requests";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-11-01T06:00:00.000Z");
const DUE = new Date("2026-12-01T06:00:00.000Z");
const PRIYA = "+919876543210";
const RAHUL = "+919811111111";
const DENTIST = "dentists/thane/naupada/smile-dental";
const BAKERY = "bakeries/thane/naupada/sweet-crumbs";
const UNKNOWN_ID = "0198f2c0-0000-7000-8000-0000000000ff";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

interface Seeded {
  readonly priyaReviewId: string;
  readonly rahulReviewId: string;
  /** Priya's comment on Rahul's review. */
  readonly priyaCommentId: string;
  /** Rahul's comment on Priya's review. */
  readonly rahulCommentId: string;
}

/**
 * Everything a visitor can leave behind, for two people, so a deletion can be seen to touch only one of them. Priya reviewed
 * the dentist and commented on Rahul's review of the bakery; Rahul commented on hers, and the dentist's owner answered it.
 */
async function seed(): Promise<Seeded> {
  const db = dbs.owner.db;
  await db.insert(directoryVisitors).values({ phone: PRIYA, name: "Priya Sharma" });
  await db.insert(directoryVisitors).values({ phone: RAHUL, name: "Rahul Rao" });
  const [priyaReview] = await db
    .insert(directoryReviews)
    .values({ listingKey: DENTIST, businessName: "Smile Dental", reviewerName: "Priya Sharma", phone: PRIYA, rating: 1, text: "Kept me waiting an hour.", highlights: [] })
    .returning({ id: directoryReviews.id });
  const [rahulReview] = await db
    .insert(directoryReviews)
    .values({ listingKey: BAKERY, businessName: "Sweet Crumbs", reviewerName: "Rahul Rao", phone: RAHUL, rating: 5, text: "Great.", highlights: [] })
    .returning({ id: directoryReviews.id });
  const [priyaComment] = await db
    .insert(directoryReviewComments)
    .values({ reviewId: rahulReview!.id, commenterName: "Priya Sharma", phone: PRIYA, text: "Agreed, lovely staff." })
    .returning({ id: directoryReviewComments.id });
  const [rahulComment] = await db
    .insert(directoryReviewComments)
    .values({ reviewId: priyaReview!.id, commenterName: "Rahul Rao", phone: RAHUL, text: "Same for me." })
    .returning({ id: directoryReviewComments.id });
  await db.insert(directoryEnquiries).values([
    { kind: "business", listingKey: DENTIST, businessName: "Smile Dental", serviceLabel: "Dentists", areaLabel: "Naupada", name: "Priya Sharma", phone: PRIYA, message: "Do you do braces?" },
    { kind: "top_list", serviceLabel: "Dentists", areaLabel: "Naupada", name: "Rahul Rao", phone: RAHUL, message: null },
  ]);
  // A comment code someone else is waiting on, for Priya's review: it must go with the review.
  await db.insert(directoryReviewOtps).values({ listingKey: DENTIST, reviewId: priyaReview!.id, phone: RAHUL, codeHash: "hash", payload: {}, expiresAt: new Date(NOW.getTime() + 600000) });
  await db.insert(directoryReviewOtps).values({ listingKey: DENTIST, phone: PRIYA, codeHash: "hash", payload: {}, expiresAt: new Date(NOW.getTime() + 600000) });
  return { priyaReviewId: priyaReview!.id, rahulReviewId: rahulReview!.id, priyaCommentId: priyaComment!.id, rahulCommentId: rahulComment!.id };
}

/** What the website's Delete link does for a visitor it already recognises: the number is proven, so it is deleted at once. */
async function deleteAsPriya(target: { readonly kind: "review" | "comment" | "business"; readonly id: string }) {
  const deleted = await dbs.staff.db.transaction((tx) => deleteContributionForProvenNumber(tx, { phone: PRIYA, target, now: NOW, dueAt: DUE }));
  return deleted === null ? ({ outcome: "not_found" } as const) : ({ outcome: "deleted", ...deleted } as const);
}

async function reviewIds(): Promise<string[]> {
  return (await dbs.owner.db.select({ id: directoryReviews.id }).from(directoryReviews)).map((row) => row.id);
}

async function commentIds(): Promise<string[]> {
  return (await dbs.owner.db.select({ id: directoryReviewComments.id }).from(directoryReviewComments)).map((row) => row.id);
}

describe("a visitor deleting one review or comment", () => {
  it("deletes their review completely, stars and the comments under it, and nothing else", async () => {
    const { priyaReviewId, rahulReviewId, priyaCommentId } = await seed();
    const received = await deleteAsPriya({ kind: "review", id: priyaReviewId });
    expect(received).toMatchObject({ outcome: "deleted", business: { placeId: null, listingKey: DENTIST } });
    expect(await reviewIds()).toEqual([rahulReviewId]);
    // Rahul's comment was under her review, so it went; her own comment elsewhere stays until she deletes it.
    expect(await commentIds()).toEqual([priyaCommentId]);
    expect(await dbs.owner.db.select().from(directoryReviewOtps).where(eq(directoryReviewOtps.phone, RAHUL))).toEqual([]);
    // Her account and enquiry are untouched: she asked about one review.
    expect(await dbs.owner.db.select().from(directoryVisitors).where(eq(directoryVisitors.phone, PRIYA))).toHaveLength(1);
    expect(await dbs.owner.db.select().from(directoryEnquiries).where(eq(directoryEnquiries.phone, PRIYA))).toHaveLength(1);
  });

  it("deletes their comment and leaves the review it was on", async () => {
    const { priyaCommentId, rahulCommentId, rahulReviewId } = await seed();
    const received = await deleteAsPriya({ kind: "comment", id: priyaCommentId });
    expect(received).toMatchObject({ outcome: "deleted", business: { listingKey: BAKERY } });
    expect(await commentIds()).toEqual([rahulCommentId]);
    expect(await reviewIds()).toContain(rahulReviewId);
  });

  it("files it closed, with the number masked and nothing they wrote", async () => {
    const { priyaReviewId } = await seed();
    const received = await deleteAsPriya({ kind: "review", id: priyaReviewId });
    const [row] = await listPrivacyRequests(dbs.staff.db);
    expect(row).toMatchObject({
      reference: received?.outcome === "deleted" ? received.reference : "",
      kind: "contribution_deletion",
      status: "closed",
      outcome: "fulfilled",
      subjectName: null,
      details: null,
      subjectContact: "+91•••••••210",
      resolution: "Deleted automatically: one review, with the comments under it.",
    });
  });

  it("deletes nothing and files nothing for someone else's review or comment, an unknown id, or one already gone", async () => {
    const { rahulReviewId, rahulCommentId, priyaReviewId } = await seed();
    for (const target of [
      { kind: "review", id: rahulReviewId },
      { kind: "comment", id: rahulCommentId },
      { kind: "review", id: UNKNOWN_ID },
      { kind: "comment", id: "not-a-uuid" },
    ] as const) {
      expect(await deleteAsPriya(target)).toEqual({ outcome: "not_found" });
    }
    expect(await reviewIds()).toHaveLength(2);
    expect(await commentIds()).toHaveLength(2);
    expect(await listPrivacyRequests(dbs.staff.db)).toEqual([]);

    await deleteAsPriya({ kind: "review", id: priyaReviewId });
    const again = await dbs.staff.db.transaction((tx) =>
      deleteContributionForProvenNumber(tx, { phone: PRIYA, target: { kind: "review", id: priyaReviewId }, now: NOW, dueAt: DUE }),
    );
    expect(again).toBeNull();
  });

  it("never deletes a business owner's answer through a visitor's number", async () => {
    const { rahulReviewId } = await seed();
    await dbs.staff.db.insert(users).values({ id: "owner-1", name: "Owner", email: "owner@example.com" });
    const [answer] = await dbs.owner.db
      .insert(directoryReviewComments)
      .values({ reviewId: rahulReviewId, authorKind: "owner", commenterName: "Owner", phone: null, ownerUserId: "owner-1", text: "Thank you." })
      .returning({ id: directoryReviewComments.id });
    expect(await deleteAsPriya({ kind: "comment", id: answer!.id })).toEqual({ outcome: "not_found" });
    expect(await commentIds()).toContain(answer!.id);
  });
});

describe("a visitor's own posts on a business page", () => {
  const PLACE = "k7m2q9a";
  const OTHER_PLACE = "p3x8w4b";

  /** Priya reviewed the place and commented on Rahul's review there; she also reviewed another place. */
  async function seedPlaces() {
    const db = dbs.owner.db;
    await db.insert(directoryPlaces).values([
      { id: PLACE, origin: "open_data", stateCode: "mh", citySlug: "thane", urlSlug: "smile-dental" },
      { id: OTHER_PLACE, origin: "open_data", stateCode: "mh", citySlug: "thane", urlSlug: "sweet-crumbs" },
    ]);
    const [priyaHere] = await db.insert(directoryReviews).values({ placeId: PLACE, businessName: "Smile Dental", reviewerName: "Priya Sharma", phone: PRIYA, rating: 1, highlights: [] }).returning({ id: directoryReviews.id });
    const [rahulHere] = await db.insert(directoryReviews).values({ placeId: PLACE, businessName: "Smile Dental", reviewerName: "Rahul Rao", phone: RAHUL, rating: 5, highlights: [] }).returning({ id: directoryReviews.id });
    const [priyaElsewhere] = await db.insert(directoryReviews).values({ placeId: OTHER_PLACE, businessName: "Sweet Crumbs", reviewerName: "Priya Sharma", phone: PRIYA, rating: 4, highlights: [] }).returning({ id: directoryReviews.id });
    const [priyaComment] = await db.insert(directoryReviewComments).values({ reviewId: rahulHere!.id, commenterName: "Priya Sharma", phone: PRIYA, text: "Not my experience." }).returning({ id: directoryReviewComments.id });
    const [rahulComment] = await db.insert(directoryReviewComments).values({ reviewId: rahulHere!.id, commenterName: "Rahul Rao", phone: RAHUL, text: "Fair enough." }).returning({ id: directoryReviewComments.id });
    return { priyaHere: priyaHere!.id, rahulHere: rahulHere!.id, priyaElsewhere: priyaElsewhere!.id, priyaComment: priyaComment!.id, rahulComment: rahulComment!.id };
  }

  it("names which of a page's reviews and comments the number wrote, and nothing of anyone else's", async () => {
    const seeded = await seedPlaces();
    const mine = await listOwnDirectoryContributions(dbs.staff.db, { phone: PRIYA, reviewIds: [seeded.priyaHere, seeded.rahulHere, "not-a-uuid"] });
    expect(mine).toEqual({ reviews: [seeded.priyaHere], comments: [seeded.priyaComment] });
    expect(await listOwnDirectoryContributions(dbs.staff.db, { phone: PRIYA, reviewIds: [] })).toEqual({ reviews: [], comments: [] });
  });

  it("deletes the number's review and comments on that business only, with the comments under the review", async () => {
    const seeded = await seedPlaces();
    const received = await deleteAsPriya({ kind: "business", id: PLACE });
    expect(received).toMatchObject({ outcome: "deleted", business: { placeId: PLACE, listingKey: null } });
    expect((await reviewIds()).sort()).toEqual([seeded.rahulHere, seeded.priyaElsewhere].sort());
    expect(await commentIds()).toEqual([seeded.rahulComment]);
    const [row] = await listPrivacyRequests(dbs.staff.db);
    expect(row?.resolution).toBe("Deleted automatically: the visitor's review and comments on one business page.");
  });

  it("files nothing for a number with nothing on that business, or a malformed place id", async () => {
    await seedPlaces();
    expect(await deleteAsPriya({ kind: "business", id: "z9z9z9z" })).toEqual({ outcome: "not_found" });
    expect(await deleteAsPriya({ kind: "business", id: "dentists/thane/naupada/x" })).toEqual({ outcome: "not_found" });
    expect(await listPrivacyRequests(dbs.staff.db)).toEqual([]);
  });
});
