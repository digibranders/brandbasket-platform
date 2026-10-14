import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimDirectoryReviewOtpAttempt,
  createDirectoryReviewOtp,
  hideDirectoryReview,
  publishDirectoryReviewFromOtp,
} from "./queries/directory";
import {
  createDirectoryCommentOtp,
  findPublishedDirectoryReviewForComment,
  listDirectoryCommentsForStaff,
  publishDirectoryCommentFromOtp,
  readDirectoryReviewComments,
} from "./queries/directory-review-actions";
import {
  editOwnerReply,
  listReviewsForOwner,
  postOwnerReply,
  removeOwnerReply,
} from "./queries/directory-owner-replies";
import type { DirectoryRef } from "./queries/directory-refs";
import { directoryReviewComments, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_USER = "owner-1";
const NOW = new Date("2026-10-12T10:00:00.000Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DENTIST = "dentists/thane/naupada/smile-dental";
const OTHER = "dentists/thane/naupada/bright-teeth";
const PRIYA = "+919876543210";
const RAHUL = "+919811111111";
const MEERA = "+919833333333";
const UNKNOWN_REVIEW = "00000000-0000-4000-8000-00000000ffff";
const OWNER = { userId: OWNER_USER, name: "Dr. Anita Kulkarni" };

let dbs: TestDatabases;
let otpSeq = 0;

function nextOtpId(): string {
  otpSeq += 1;
  return `00000000-0000-4000-8000-${otpSeq.toString().padStart(12, "0")}`;
}

function byKey(listingKey: string): DirectoryRef {
  return { placeId: null, listingKey };
}

function minutesAfter(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

/** Publishes a review of the business the way the confirm route does, and returns its id. */
async function publishReview(phone: string, listingKey = DENTIST, businessName = "Smile Dental", ownerContact?: boolean): Promise<string> {
  const otpId = await createDirectoryReviewOtp(dbs.staff.db, {
    id: nextOtpId(),
    business: byKey(listingKey),
    phone,
    codeHash: "hash",
    payload: {
      businessName,
      reviewerName: "Priya Sharma",
      rating: 4,
      text: "Painless and on time.",
      highlights: [],
      ...(ownerContact === undefined ? {} : { ownerContact }),
    },
    expiresAt: new Date(NOW.getTime() + TEN_MINUTES_MS),
  });
  await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
  const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
  if (published === null) throw new Error("The review was not published");
  return published.reviewId;
}

/** A visitor's comment, published the way the comment confirm route does. */
async function visitorComment(reviewId: string, phone: string, text = "Same experience here.", now = NOW): Promise<string> {
  const review = await findPublishedDirectoryReviewForComment(dbs.staff.db, reviewId);
  if (review === null) throw new Error("No such published review");
  const id = nextOtpId();
  await createDirectoryCommentOtp(dbs.staff.db, {
    id,
    review,
    phone,
    codeHash: "hash",
    payload: { commenterName: "Rahul Mehta", text },
    expiresAt: new Date(now.getTime() + TEN_MINUTES_MS),
  });
  await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId: id, maxAttempts: MAX_ATTEMPTS, now });
  const published = await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: id, maxAttempts: MAX_ATTEMPTS, now });
  if (published === null) throw new Error("The comment was not published");
  return published.commentId;
}

async function ownerReply(reviewId: string, text = "Thank you, Priya. See you at your next check-up.", now = NOW): Promise<string> {
  const posted = await postOwnerReply(dbs.staff.db, { business: byKey(DENTIST), reviewId, owner: OWNER, text, now });
  if (posted === null) throw new Error("The reply was not posted");
  return posted.commentId;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: OWNER_USER, name: OWNER.name, email: "anita@smile-dental.test" });
});

describe("postOwnerReply", () => {
  it("posts the owner's answer under their own business's review, signed with the business's name", async () => {
    const reviewId = await publishReview(PRIYA);
    const posted = await postOwnerReply(dbs.staff.db, { business: byKey(DENTIST), reviewId, owner: OWNER, text: "Thank you, Priya.", now: NOW });
    expect(posted).not.toBeNull();

    const [row] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, posted?.commentId ?? ""));
    expect(row).toMatchObject({ authorKind: "owner", ownerUserId: OWNER_USER, phone: null, commenterName: OWNER.name, status: "published", editedAt: null });
    expect(row?.createdAt).toEqual(NOW);
  });

  it("will not answer a review of another business, a hidden one, an unknown one or an id that is not one", async () => {
    const theirs = await publishReview(RAHUL, OTHER, "Bright Teeth");
    const mine = await publishReview(PRIYA);
    await hideDirectoryReview(dbs.staff.db, { reviewId: mine, staffUserId: OWNER_USER, now: NOW });
    const post = (reviewId: string) => postOwnerReply(dbs.staff.db, { business: byKey(DENTIST), reviewId, owner: OWNER, text: "Hello.", now: NOW });

    expect(await post(theirs)).toBeNull();
    expect(await post(mine)).toBeNull();
    expect(await post(UNKNOWN_REVIEW)).toBeNull();
    expect(await post("not-an-id")).toBeNull();
    expect(await dbs.owner.db.select().from(directoryReviewComments)).toHaveLength(0);
  });

  it("holds an answer to 1 to 500 characters, and a visitor's comment still to 300", async () => {
    const reviewId = await publishReview(PRIYA);
    const post = (text: string) => postOwnerReply(dbs.staff.db, { business: byKey(DENTIST), reviewId, owner: OWNER, text, now: NOW });

    expect(await captureErrorText(post(""))).toContain("directory_review_comments_text_check");
    expect(await captureErrorText(post("a".repeat(501)))).toContain("directory_review_comments_text_check");
    expect(await post("a".repeat(500))).not.toBeNull();

    const visitor = (text: string) =>
      dbs.owner.db.insert(directoryReviewComments).values({ reviewId, commenterName: "Rahul Mehta", phone: RAHUL, text });
    expect(await captureErrorText(visitor("a".repeat(301)))).toContain("directory_review_comments_text_check");
  });

  it("keeps the two kinds apart: an owner row has an account and no number, a visitor's a number and no account", async () => {
    const reviewId = await publishReview(PRIYA);
    const insert = (values: Partial<typeof directoryReviewComments.$inferInsert>) =>
      dbs.owner.db.insert(directoryReviewComments).values({ reviewId, commenterName: "Someone", text: "Hi.", ...values });

    expect(await captureErrorText(insert({ authorKind: "owner", phone: RAHUL, ownerUserId: OWNER_USER }))).toContain("directory_review_comments_author_check");
    expect(await captureErrorText(insert({ authorKind: "owner" }))).toContain("directory_review_comments_author_check");
    expect(await captureErrorText(insert({ authorKind: "visitor", phone: RAHUL, ownerUserId: OWNER_USER }))).toContain("directory_review_comments_author_check");
    expect(await captureErrorText(insert({ authorKind: "visitor" }))).toContain("directory_review_comments_author_check");
  });
});

describe("what visitors see", () => {
  it("shows the owner's answer with the Owner flag and the business's name, and never the account or number", async () => {
    const reviewId = await publishReview(PRIYA);
    await visitorComment(reviewId, RAHUL, "Same here.", minutesAfter(1));
    const replyId = await ownerReply(reviewId, "Thank you both.", minutesAfter(2));

    const read = (await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId);
    expect(read?.total).toBe(2);
    expect(read?.comments.map((comment) => comment.byOwner)).toEqual([false, true]);
    const owner = read?.comments[1];
    expect(owner).toMatchObject({ id: replyId, displayName: "Smile Dental", text: "Thank you both.", byOwner: true, edited: false });
    expect(JSON.stringify(read)).not.toContain(OWNER.name);
    expect(JSON.stringify(read)).not.toContain(OWNER_USER);
  });

  it("says an answer was edited once it has been", async () => {
    const reviewId = await publishReview(PRIYA);
    const replyId = await ownerReply(reviewId);
    await editOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, text: "Thank you, Priya!", now: minutesAfter(5) });

    const read = (await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId);
    expect(read?.comments[0]).toMatchObject({ text: "Thank you, Priya!", byOwner: true, edited: true });
  });
});

describe("editOwnerReply", () => {
  it("changes the words and records when", async () => {
    const reviewId = await publishReview(PRIYA);
    const replyId = await ownerReply(reviewId);

    expect(await editOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, text: "Updated words.", now: minutesAfter(5) })).toEqual(NOW);
    const [row] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, replyId));
    expect(row).toMatchObject({ text: "Updated words.", editedAt: minutesAfter(5), createdAt: NOW });
  });

  it("only edits an owner's own published answer of this business, never a visitor's comment", async () => {
    const reviewId = await publishReview(PRIYA);
    const visitorId = await visitorComment(reviewId, RAHUL);
    const replyId = await ownerReply(reviewId);
    const edit = (business: DirectoryRef, commentId: string) => editOwnerReply(dbs.staff.db, { business, commentId, text: "Changed.", now: minutesAfter(5) });

    expect(await edit(byKey(DENTIST), visitorId)).toBeNull();
    expect(await edit(byKey(OTHER), replyId)).toBeNull();
    expect(await edit(byKey(DENTIST), UNKNOWN_REVIEW)).toBeNull();
    expect(await edit(byKey(DENTIST), "not-an-id")).toBeNull();
    const [visitor] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, visitorId));
    expect(visitor?.text).toBe("Same experience here.");
    expect(visitor?.editedAt).toBeNull();
  });

  it("will not bring back an answer that was taken down", async () => {
    const reviewId = await publishReview(PRIYA);
    const replyId = await ownerReply(reviewId);
    await removeOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, ownerUserId: OWNER_USER, now: minutesAfter(1) });

    expect(await editOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, text: "Back again.", now: minutesAfter(2) })).toBeNull();
  });
});

describe("removeOwnerReply", () => {
  it("takes the answer down by hiding it, recording who did", async () => {
    const reviewId = await publishReview(PRIYA);
    const replyId = await ownerReply(reviewId);

    expect(await removeOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, ownerUserId: OWNER_USER, now: minutesAfter(3) })).toBe(true);
    const [row] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, replyId));
    expect(row).toMatchObject({ status: "hidden", hiddenAt: minutesAfter(3), hiddenByUserId: OWNER_USER });
    expect((await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId)).toBeUndefined();
    expect(await removeOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, ownerUserId: OWNER_USER, now: minutesAfter(4) })).toBe(false);
  });

  it("only removes an owner's answer of this business, never a visitor's comment", async () => {
    const reviewId = await publishReview(PRIYA);
    const visitorId = await visitorComment(reviewId, RAHUL);
    const replyId = await ownerReply(reviewId);
    const remove = (business: DirectoryRef, commentId: string) =>
      removeOwnerReply(dbs.staff.db, { business, commentId, ownerUserId: OWNER_USER, now: minutesAfter(3) });

    expect(await remove(byKey(DENTIST), visitorId)).toBe(false);
    expect(await remove(byKey(OTHER), replyId)).toBe(false);
    expect(await remove(byKey(DENTIST), "not-an-id")).toBe(false);
    expect((await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId)?.total).toBe(2);
  });
});

describe("listReviewsForOwner", () => {
  it("lists the business's published reviews newest first, each with its conversation and whether it still needs an answer", async () => {
    const older = await publishReview(PRIYA);
    const newer = await publishReview(MEERA);
    await dbs.owner.db.execute(sql`update directory_reviews set created_at = ${minutesAfter(-60)} where id = ${older}`);
    await visitorComment(older, RAHUL, "Agreed.", minutesAfter(1));
    await ownerReply(older, "Thank you.", minutesAfter(2));
    await publishReview(RAHUL, OTHER, "Bright Teeth");
    const hidden = await publishReview("+919844444444");
    await hideDirectoryReview(dbs.staff.db, { reviewId: hidden, staffUserId: OWNER_USER, now: NOW });

    const page = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 10, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.all).toBe(2);
    expect(page.unanswered).toBe(1);
    expect(page.reviews.map((review) => review.id)).toEqual([newer, older]);
    expect(page.reviews.map((review) => review.needsReply)).toEqual([true, false]);
    expect(page.reviews[1]?.comments.map((comment) => [comment.byOwner, comment.text])).toEqual([
      [false, "Agreed."],
      [true, "Thank you."],
    ]);
    expect(page.reviews[1]?.comments[1]?.canEdit).toBe(true);
    expect(page.reviews[1]?.comments[0]?.canEdit).toBe(false);
    expect(page.reviews[0]).toMatchObject({ rating: 4, text: "Painless and on time.", displayName: "Priya S." });
  });

  it("filters to the reviews still waiting for an answer and pages them", async () => {
    const answered = await publishReview(PRIYA);
    await publishReview(MEERA);
    await publishReview(RAHUL);
    await ownerReply(answered);

    const waiting = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "unanswered", limit: 1, offset: 0 });
    expect(waiting.total).toBe(2);
    expect(waiting.all).toBe(3);
    expect(waiting.unanswered).toBe(2);
    expect(waiting.reviews).toHaveLength(1);
    expect(waiting.reviews.every((review) => review.needsReply)).toBe(true);
    const next = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "unanswered", limit: 1, offset: 1 });
    expect(next.reviews[0]?.id).not.toBe(waiting.reviews[0]?.id);
  });

  it("counts a review as answered only while the owner's answer is published", async () => {
    const reviewId = await publishReview(PRIYA);
    const replyId = await ownerReply(reviewId);
    await removeOwnerReply(dbs.staff.db, { business: byKey(DENTIST), commentId: replyId, ownerUserId: OWNER_USER, now: minutesAfter(1) });

    const page = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 10, offset: 0 });
    expect(page.unanswered).toBe(1);
    expect(page.reviews[0]?.comments).toEqual([]);
  });

  it("shows the owner a reviewer's number only when they ticked that the business may contact them", async () => {
    await publishReview(PRIYA, DENTIST, "Smile Dental", true);
    await publishReview(RAHUL);
    const page = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 10, offset: 0 });
    expect(page.reviews.map((review) => review.contactPhone).sort()).toEqual([PRIYA, null].sort());
  });

  it("hides the number again when the reviewer posts a new review without the tick", async () => {
    await publishReview(PRIYA, DENTIST, "Smile Dental", true);
    await publishReview(PRIYA, DENTIST, "Smile Dental", false);
    const page = await listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 10, offset: 0 });
    expect(page.reviews.map((review) => review.contactPhone)).toEqual([null]);
  });

  it("refuses a limit or offset that is not a whole number", async () => {
    await expect(listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 0, offset: 0 })).rejects.toThrow(RangeError);
    await expect(listReviewsForOwner(dbs.staff.db, byKey(DENTIST), { filter: "all", limit: 10, offset: -1 })).rejects.toThrow(RangeError);
  });
});

describe("staff moderation", () => {
  it("lists an owner's answer with its kind and no number, so staff can hide it like any other", async () => {
    const reviewId = await publishReview(PRIYA);
    await visitorComment(reviewId, RAHUL);
    await ownerReply(reviewId);

    const page = await listDirectoryCommentsForStaff(dbs.staff.db, { status: "all", limit: 10, offset: 0 });
    const kinds = page.rows.map((row) => [row.authorKind, row.phone]);
    expect(kinds).toContainEqual(["owner", null]);
    expect(kinds).toContainEqual(["visitor", RAHUL]);
  });
});

describe("who may touch owner answers", () => {
  it("is still the staff role alone: the app and public roles have no access", async () => {
    const reviewId = await publishReview(PRIYA);
    await ownerReply(reviewId);
    expect(await captureErrorText(dbs.app.db.select().from(directoryReviewComments))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(directoryReviewComments))).toContain("permission denied");
  });
});
