import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimDirectoryReviewOtpAttempt,
  createDirectoryReviewOtp,
  hideDirectoryReview,
  listPublishedDirectoryReviews,
  publishDirectoryReviewFromOtp,
  type DirectoryReviewOtpPayload,
} from "./queries/directory";
import {
  DIRECTORY_COMMENTS_SHOWN_PER_REVIEW,
  countDirectoryComments,
  createDirectoryCommentOtp,
  findPublishedDirectoryReviewForComment,
  hideDirectoryComment,
  incrementDirectoryReviewHelpful,
  listDirectoryCommentsForStaff,
  publishDirectoryCommentFromOtp,
  readDirectoryReviewComments,
  readDirectoryReviewHelpful,
  restoreDirectoryComment,
} from "./queries/directory-review-actions";
import type { DirectoryRef } from "./queries/directory-refs";
import { directoryReviewComments, directoryReviewOtps, directoryReviews, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF_USER = "staff-1";
const NOW = new Date("2026-10-08T10:00:00.000Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DENTIST = "dentists/thane/naupada/smile-dental";
const PRIYA = "+919876543210";
const RAHUL = "+919811111111";
const MEERA = "+919833333333";
const UNKNOWN_REVIEW = "00000000-0000-4000-8000-00000000ffff";

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

/** Publishes a review the way the confirm route does, and returns its id. */
async function publishReview(phone: string, overrides: Partial<DirectoryReviewOtpPayload> = {}): Promise<string> {
  const otpId = await createDirectoryReviewOtp(dbs.staff.db, {
    id: nextOtpId(),
    business: byKey(DENTIST),
    phone,
    codeHash: "hash",
    payload: { businessName: "Smile Dental", reviewerName: "Priya Sharma", rating: 5, text: "Painless and on time.", highlights: [], ...overrides },
    expiresAt: new Date(NOW.getTime() + TEN_MINUTES_MS),
  });
  await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
  const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
  if (published === null) throw new Error("The review was not published");
  return published.reviewId;
}

async function commentCode(reviewId: string, phone: string, text = "Same experience here.", name = "Rahul Mehta", expiresAt = minutesAfter(10)): Promise<string> {
  const review = await findPublishedDirectoryReviewForComment(dbs.staff.db, reviewId);
  if (review === null) throw new Error("No such published review");
  const id = nextOtpId();
  await createDirectoryCommentOtp(dbs.staff.db, { id, review, phone, codeHash: "hash", payload: { commenterName: name, text }, expiresAt });
  return id;
}

/** Claims an attempt and publishes, the way the comment confirm route does once the code matched. */
async function comment(reviewId: string, phone: string, text = "Same experience here.", name = "Rahul Mehta", now = NOW): Promise<string> {
  const otpId = await commentCode(reviewId, phone, text, name, new Date(now.getTime() + TEN_MINUTES_MS));
  await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now });
  const published = await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now });
  if (published === null) throw new Error("The comment was not published");
  return published.commentId;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF_USER, name: "Sam Staff", email: "sam@brandbasket.test" });
});

describe("Helpful", () => {
  it("counts up from zero and answers each count", async () => {
    const reviewId = await publishReview(PRIYA);
    expect(await readDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(0);
    expect(await incrementDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(1);
    expect(await incrementDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(2);
    expect(await readDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(2);
  });

  it("counts every one of many at once", async () => {
    const reviewId = await publishReview(PRIYA);
    await Promise.all(Array.from({ length: 12 }, () => incrementDirectoryReviewHelpful(dbs.staff.db, reviewId)));
    expect(await readDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(12);
  });

  it("is null for a review that is hidden, unknown or not an id", async () => {
    const reviewId = await publishReview(PRIYA);
    await hideDirectoryReview(dbs.staff.db, { reviewId, staffUserId: STAFF_USER, now: NOW });
    expect(await incrementDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBeNull();
    expect(await readDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBeNull();
    expect(await incrementDirectoryReviewHelpful(dbs.staff.db, UNKNOWN_REVIEW)).toBeNull();
    expect(await incrementDirectoryReviewHelpful(dbs.staff.db, "not-a-uuid")).toBeNull();
  });

  it("shows on the public page of reviews", async () => {
    const reviewId = await publishReview(PRIYA);
    await incrementDirectoryReviewHelpful(dbs.staff.db, reviewId);
    const page = await listPublishedDirectoryReviews(dbs.staff.db, { business: byKey(DENTIST), page: 1, pageSize: 10 });
    expect(page.reviews.map((entry) => entry.helpfulCount)).toEqual([1]);
  });

  it("starts again at zero when the same phone reviews again, since the words are new", async () => {
    const reviewId = await publishReview(PRIYA);
    await incrementDirectoryReviewHelpful(dbs.staff.db, reviewId);
    const again = await publishReview(PRIYA, { text: "Even better the second time." });
    expect(again).toBe(reviewId);
    expect(await readDirectoryReviewHelpful(dbs.staff.db, reviewId)).toBe(0);
  });

  it("can never go below zero", async () => {
    const reviewId = await publishReview(PRIYA);
    const error = await captureErrorText(
      dbs.owner.db.update(directoryReviews).set({ helpfulCount: -1 }).where(eq(directoryReviews.id, reviewId)),
    );
    expect(error).toContain("directory_reviews_helpful_count_check");
  });
});

describe("comments", () => {
  it("publishes the comment a code was holding, and the code is used up", async () => {
    const reviewId = await publishReview(PRIYA);
    const otpId = await commentCode(reviewId, RAHUL);
    await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    const published = await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(published).toEqual({ commentId: expect.any(String), reviewId });
    expect(await dbs.owner.db.select().from(directoryReviewOtps)).toEqual([]);
    const stored = await dbs.owner.db.select().from(directoryReviewComments);
    expect(stored).toMatchObject([{ reviewId, commenterName: "Rahul Mehta", phone: RAHUL, text: "Same experience here.", status: "published", createdAt: NOW }]);
  });

  it("publishes nothing twice, after expiry, past the attempt ceiling or on an unknown code", async () => {
    const reviewId = await publishReview(PRIYA);
    const otpId = await commentCode(reviewId, RAHUL);
    await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).not.toBeNull();
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    const late = await commentCode(reviewId, MEERA);
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: late, maxAttempts: MAX_ATTEMPTS, now: minutesAfter(11) })).toBeNull();

    const spent = await commentCode(reviewId, MEERA);
    await dbs.owner.db.update(directoryReviewOtps).set({ attempts: MAX_ATTEMPTS + 1 }).where(eq(directoryReviewOtps.id, spent));
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: spent, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: nextOtpId(), maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: "nope", maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await dbs.owner.db.select().from(directoryReviewComments)).toHaveLength(1);
  });

  it("publishes nothing, and drops the code, when the review was hidden after the code was asked for", async () => {
    const reviewId = await publishReview(PRIYA);
    const otpId = await commentCode(reviewId, RAHUL);
    await hideDirectoryReview(dbs.staff.db, { reviewId, staffUserId: STAFF_USER, now: NOW });
    await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await dbs.owner.db.select().from(directoryReviewComments)).toEqual([]);
    expect(await dbs.owner.db.select().from(directoryReviewOtps)).toEqual([]);
  });

  it("will not take a comment on a hidden or unknown review in the first place", async () => {
    const reviewId = await publishReview(PRIYA);
    await hideDirectoryReview(dbs.staff.db, { reviewId, staffUserId: STAFF_USER, now: NOW });
    expect(await findPublishedDirectoryReviewForComment(dbs.staff.db, reviewId)).toBeNull();
    expect(await findPublishedDirectoryReviewForComment(dbs.staff.db, UNKNOWN_REVIEW)).toBeNull();
    expect(await findPublishedDirectoryReviewForComment(dbs.staff.db, "not-a-uuid")).toBeNull();
  });

  it("keeps a comment's code from ever publishing a review, and a review's code from publishing a comment", async () => {
    const reviewId = await publishReview(PRIYA);
    const otpId = await commentCode(reviewId, RAHUL);
    await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await dbs.owner.db.select().from(directoryReviews)).toHaveLength(1);

    const reviewCode = await createDirectoryReviewOtp(dbs.staff.db, {
      id: nextOtpId(),
      business: byKey(DENTIST),
      phone: MEERA,
      codeHash: "hash",
      payload: { businessName: "Smile Dental", reviewerName: "Meera K", rating: 4, text: "Fine.", highlights: [] },
      expiresAt: minutesAfter(10),
    });
    await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId: reviewCode, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(await publishDirectoryCommentFromOtp(dbs.staff.db, { otpId: reviewCode, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await dbs.owner.db.select().from(directoryReviewComments)).toEqual([]);
  });

  it("holds a comment to 1 to 300 characters, a name to 60 and a real phone number", async () => {
    const reviewId = await publishReview(PRIYA);
    const base = { reviewId, commenterName: "Rahul Mehta", phone: RAHUL, text: "Fine." };
    const insert = (overrides: Partial<typeof base>) => dbs.owner.db.insert(directoryReviewComments).values({ ...base, ...overrides });
    expect(await captureErrorText(insert({ text: "" }))).toContain("directory_review_comments_text_check");
    expect(await captureErrorText(insert({ text: "a".repeat(301) }))).toContain("directory_review_comments_text_check");
    expect(await captureErrorText(insert({ commenterName: "n".repeat(61) }))).toContain("directory_review_comments_commenter_name_check");
    expect(await captureErrorText(insert({ phone: "98765" }))).toContain("directory_review_comments_phone_check");
    await insert({ text: "a".repeat(300) });
  });
});

describe("readDirectoryReviewComments", () => {
  it("gives each review its comments oldest first, with how many it has, and leaves out hidden ones", async () => {
    const first = await publishReview(PRIYA);
    const second = await publishReview(RAHUL, { reviewerName: "Rahul Mehta" });
    const early = await comment(first, MEERA, "First.", "Meera Kapoor", minutesAfter(1));
    await comment(first, RAHUL, "Second.", "Rahul Mehta", minutesAfter(2));
    const hidden = await comment(first, PRIYA, "Rude.", "Priya Sharma", minutesAfter(3));
    await hideDirectoryComment(dbs.staff.db, { commentId: hidden, staffUserId: STAFF_USER, now: minutesAfter(4) });
    await comment(second, MEERA, "On the other.", "Meera Kapoor", minutesAfter(5));

    const comments = await readDirectoryReviewComments(dbs.staff.db, [first, second, UNKNOWN_REVIEW]);
    expect([...comments.keys()].sort()).toEqual([first, second].sort());
    const thread = comments.get(first);
    expect(thread?.total).toBe(2);
    expect(thread?.comments.map((entry) => [entry.id === early, entry.displayName, entry.text])).toEqual([
      [true, "Meera K.", "First."],
      [false, "Rahul M.", "Second."],
    ]);
    expect(comments.get(second)?.total).toBe(1);
  });

  it("shows only the latest few of a long conversation, oldest first, but counts them all", async () => {
    const reviewId = await publishReview(PRIYA);
    const total = DIRECTORY_COMMENTS_SHOWN_PER_REVIEW + 3;
    for (let index = 1; index <= total; index += 1) await comment(reviewId, RAHUL, `Comment ${index}`, "Rahul Mehta", minutesAfter(index));
    const thread = (await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId);
    expect(thread?.total).toBe(total);
    expect(thread?.comments).toHaveLength(DIRECTORY_COMMENTS_SHOWN_PER_REVIEW);
    expect(thread?.comments[0]?.text).toBe("Comment 4");
    expect(thread?.comments.at(-1)?.text).toBe(`Comment ${total}`);
  });

  it("never gives the full name or the phone to the public read", async () => {
    const reviewId = await publishReview(PRIYA);
    await comment(reviewId, RAHUL, "Hello.", "Rahul Anand Mehta");
    const thread = (await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId);
    expect(thread?.comments[0]?.displayName).toBe("Rahul M.");
    expect(JSON.stringify(thread)).not.toContain(RAHUL);
    expect(JSON.stringify(thread)).not.toContain("Anand");
  });

  it("answers an empty list and ids that are not ids with nothing", async () => {
    expect((await readDirectoryReviewComments(dbs.staff.db, [])).size).toBe(0);
    expect((await readDirectoryReviewComments(dbs.staff.db, ["nope"])).size).toBe(0);
  });
});

describe("staff moderation of comments", () => {
  it("lists newest first with the review's context, filters by status and counts them", async () => {
    const reviewId = await publishReview(PRIYA, { text: "Painless." });
    const older = await comment(reviewId, RAHUL, "Older.", "Rahul Mehta", minutesAfter(1));
    const newer = await comment(reviewId, MEERA, "Newer.", "Meera Kapoor", minutesAfter(2));
    await hideDirectoryComment(dbs.staff.db, { commentId: older, staffUserId: STAFF_USER, now: minutesAfter(3) });

    const all = await listDirectoryCommentsForStaff(dbs.staff.db, { status: "all", limit: 10, offset: 0 });
    expect(all.total).toBe(2);
    expect(all.rows.map((row) => row.id)).toEqual([newer, older]);
    expect(all.rows[0]).toMatchObject({ businessName: "Smile Dental", reviewerName: "Priya Sharma", reviewText: "Painless.", commenterName: "Meera Kapoor", phone: MEERA, status: "published" });
    expect((await listDirectoryCommentsForStaff(dbs.staff.db, { status: "hidden", limit: 10, offset: 0 })).rows.map((row) => row.id)).toEqual([older]);
    expect(await countDirectoryComments(dbs.staff.db)).toEqual({ published: 1, hidden: 1 });
    await expect(listDirectoryCommentsForStaff(dbs.staff.db, { status: "all", limit: 0, offset: 0 })).rejects.toThrow(RangeError);
    await expect(listDirectoryCommentsForStaff(dbs.staff.db, { status: "all", limit: 1, offset: -1 })).rejects.toThrow(RangeError);
  });

  it("hides a published comment once and restores a hidden one once", async () => {
    const reviewId = await publishReview(PRIYA);
    const commentId = await comment(reviewId, RAHUL);
    expect(await hideDirectoryComment(dbs.staff.db, { commentId, staffUserId: STAFF_USER, now: minutesAfter(1) })).toBe(true);
    expect(await hideDirectoryComment(dbs.staff.db, { commentId, staffUserId: STAFF_USER, now: minutesAfter(1) })).toBe(false);
    expect((await readDirectoryReviewComments(dbs.staff.db, [reviewId])).size).toBe(0);
    const [hidden] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, commentId));
    expect(hidden).toMatchObject({ status: "hidden", hiddenAt: minutesAfter(1), hiddenByUserId: STAFF_USER });

    expect(await restoreDirectoryComment(dbs.staff.db, commentId)).toBe(true);
    expect(await restoreDirectoryComment(dbs.staff.db, commentId)).toBe(false);
    expect((await readDirectoryReviewComments(dbs.staff.db, [reviewId])).get(reviewId)?.total).toBe(1);
    const [restored] = await dbs.owner.db.select().from(directoryReviewComments).where(eq(directoryReviewComments.id, commentId));
    expect(restored).toMatchObject({ status: "published", hiddenAt: null, hiddenByUserId: null });
  });

  it("refuses an id that is not a comment", async () => {
    expect(await hideDirectoryComment(dbs.staff.db, { commentId: "nope", staffUserId: STAFF_USER, now: NOW })).toBe(false);
    expect(await hideDirectoryComment(dbs.staff.db, { commentId: UNKNOWN_REVIEW, staffUserId: STAFF_USER, now: NOW })).toBe(false);
    expect(await restoreDirectoryComment(dbs.staff.db, "nope")).toBe(false);
  });
});

describe("who may touch comments", () => {
  it("lets only the staff role read or write them: the app and public roles have no access", async () => {
    const reviewId = await publishReview(PRIYA);
    await comment(reviewId, RAHUL);
    expect(await captureErrorText(dbs.app.db.select().from(directoryReviewComments))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(directoryReviewComments))).toContain("permission denied");
    expect(await captureErrorText(dbs.app.db.delete(directoryReviewComments))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.delete(directoryReviewComments))).toContain("permission denied");
  });

  it("lets the staff role delete a comment, so its author can take it down (0156)", async () => {
    const reviewId = await publishReview(PRIYA);
    await comment(reviewId, RAHUL);
    expect(await dbs.staff.db.delete(directoryReviewComments).where(eq(directoryReviewComments.reviewId, reviewId)).returning({ id: directoryReviewComments.id })).toHaveLength(1);
  });
});
