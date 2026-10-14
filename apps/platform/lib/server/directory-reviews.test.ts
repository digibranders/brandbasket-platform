import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDirectoryReviewOtpAttempt,
  consumeRateLimit,
  createDirectoryReviewOtp,
  findDirectoryReviewOtp,
  listPublishedDirectoryReviews,
  publishDirectoryReviewFromOtp,
  readDirectoryRatings,
  readDirectoryReviewComments,
  resolveDirectoryAsk,
  resolveDirectoryNamed,
  resolveDirectoryNamedForRead,
  type Database,
  type DirectoryReviewOtpRow,
} from "@fynix/db";
import { getStaffDb } from "./db";
import type { ReviewInput } from "./directory-fields";
import { accountCodeSecret } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { startVisitorSession, type ResolvedVisitor } from "./directory-visitor";
import { recordContributionConsent } from "./visitor-consent";
import { confirmReviewOtp, publishReviewAsVisitor, readRatings, readReviews, requestReviewOtp } from "./directory-reviews";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./directory-visitor", () => ({ startVisitorSession: vi.fn(async () => undefined) }));
vi.mock("./visitor-consent", () => ({ recordContributionConsent: vi.fn() }));
vi.mock("./env", () => ({ accountCodeSecret: vi.fn() }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return {
    answerByAsked: actual.answerByAsked,
    directoryLookupOf: actual.directoryLookupOf,
    directoryRefId: actual.directoryRefId,
    resolveDirectoryAsk: vi.fn(),
    resolveDirectoryNamed: vi.fn(),
    resolveDirectoryNamedForRead: vi.fn(),
    claimDirectoryReviewOtpAttempt: vi.fn(),
  consumeRateLimit: vi.fn(),
  createDirectoryReviewOtp: vi.fn(),
  deleteDirectoryReviewOtp: vi.fn(),
  findDirectoryReviewOtp: vi.fn(),
  listPublishedDirectoryReviews: vi.fn(),
  publishDirectoryReviewFromOtp: vi.fn(),
    readDirectoryRatings: vi.fn(),
    readDirectoryReviewComments: vi.fn(),
  };
});

const SECRET = "s".repeat(32);
const NOW = new Date("2026-09-29T10:00:00.000Z");
const KEY = "dentists/thane/naupada/smile-dental";
const OLD_KEY = "dentists/thane/naupada/smile-dental-clinic";
const ID = "k7m2q9a";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DB = {} as Database;

const INPUT: ReviewInput = {
  business: { by: "key", key: KEY },
  businessName: "Smile Dental",
  rating: 4,
  text: "Gentle.",
  highlights: ["on_time"],
  name: "Priya Sharma",
  phone: "+919876543210",
  ownerContact: false,
};

function otpRow(overrides: Partial<DirectoryReviewOtpRow> = {}): DirectoryReviewOtpRow {
  return {
    id: OTP_ID,
    listingKey: KEY,
    placeId: null,
    reviewId: null,
    phone: INPUT.phone,
    codeHash: hashOtpCode(OTP_ID, "123456", SECRET),
    payload: { businessName: "Smile Dental", reviewerName: "Priya Sharma", rating: 4, text: null, highlights: [] },
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + 600_000),
    verifiedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(accountCodeSecret).mockReturnValue(SECRET);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(readDirectoryReviewComments).mockResolvedValue(new Map());
  vi.mocked(createDirectoryReviewOtp).mockImplementation(async (_db, otp) => otp.id);
  vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 1 });
  vi.mocked(publishDirectoryReviewFromOtp).mockResolvedValue({ reviewId: "review-1", replaced: false });
  vi.mocked(resolveDirectoryNamed).mockResolvedValue({ placeId: ID, listingKey: KEY });
});

describe("requestReviewOtp", () => {
  it("is unavailable and touches nothing: Fynix sends no code to a phone, so there is no way to prove a number", async () => {
    expect(await requestReviewOtp()).toEqual({ kind: "unavailable" });
    expect(resolveDirectoryNamed).not.toHaveBeenCalled();
    expect(createDirectoryReviewOtp).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});

const VISITOR = { id: "visitor-1", identity: { name: "Priya Sharma", phone: INPUT.phone }, session: { token: "t", name: "Priya Sharma", phoneHint: "•••• 3210" } } as ResolvedVisitor;

const CONSENT = { noticeVersion: "pre-dpdp", adult: true } as const;

describe("what a reviewer agreed to", () => {
  it("is kept with the held review, to record once it is published", async () => {
    await publishReviewAsVisitor({ ...INPUT, consent: CONSENT }, VISITOR, "203.0.113.9", NOW);
    expect(vi.mocked(createDirectoryReviewOtp).mock.calls[0]?.[1].payload).toMatchObject({ consent: CONSENT });
  });

  it("leaves the held review as it was for a request that carried none", async () => {
    await publishReviewAsVisitor(INPUT, VISITOR, "203.0.113.9", NOW);
    expect(vi.mocked(createDirectoryReviewOtp).mock.calls[0]?.[1].payload).not.toHaveProperty("consent");
  });

  it("is recorded against the visitor account opened when the code is confirmed", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(
      otpRow({ payload: { businessName: "Smile Dental", reviewerName: "Priya Sharma", rating: 4, text: null, highlights: [], consent: CONSENT } }),
    );
    await confirmReviewOtp(OTP_ID, "123456", "203.0.113.9", NOW);
    expect(startVisitorSession).toHaveBeenCalledWith(INPUT.phone, "Priya Sharma", NOW, CONSENT);
  });

  it("is recorded against a recognised visitor's account when their review is published without a code", async () => {
    expect(await publishReviewAsVisitor({ ...INPUT, consent: CONSENT }, VISITOR, "203.0.113.9", NOW)).toMatchObject({ kind: "published" });
    expect(recordContributionConsent).toHaveBeenCalledWith(DB, "visitor-1", CONSENT);
  });

  it("is not recorded for a review that was not published", async () => {
    const visitor = { id: "visitor-1", identity: { name: "P", phone: INPUT.phone }, session: { token: "t", name: "P", phoneHint: "x" } } as ResolvedVisitor;
    vi.mocked(publishDirectoryReviewFromOtp).mockResolvedValue(null);
    expect(await publishReviewAsVisitor({ ...INPUT, consent: CONSENT }, visitor, "203.0.113.9", NOW)).toMatchObject({ kind: "failed" });
    expect(recordContributionConsent).not.toHaveBeenCalled();
  });
});

describe("confirmReviewOtp", () => {
  beforeEach(() => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(otpRow());
  });

  it("publishes the review for the right code", async () => {
    expect(await confirmReviewOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "published" });
    expect(claimDirectoryReviewOtpAttempt).toHaveBeenCalledWith(DB, { otpId: OTP_ID, maxAttempts: 5, now: NOW });
    expect(publishDirectoryReviewFromOtp).toHaveBeenCalledWith(DB, { otpId: OTP_ID, maxAttempts: 5, now: NOW });
  });

  it("counts down the tries for a wrong code and publishes nothing", async () => {
    vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 4 });
    expect(await confirmReviewOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toEqual({
      kind: "wrong_code",
      message: "That code isn't right. 1 try left.",
    });
    vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 5 });
    expect(await confirmReviewOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toEqual({
      kind: "too_many_attempts",
      message: "No tries left. Ask for a new code.",
    });
    expect(publishDirectoryReviewFromOtp).not.toHaveBeenCalled();
  });

  it("reads a missing, used or expired code as expired, and an exhausted one as too many attempts", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(null);
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ verifiedAt: NOW }));
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ expiresAt: NOW }));
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ attempts: 5 }));
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toMatchObject({ kind: "too_many_attempts" });
    expect(claimDirectoryReviewOtpAttempt).not.toHaveBeenCalled();
  });

  it("never confirms a comment's code as a review: the code names a review, so it reads as expired", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ reviewId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c" }));
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    expect(claimDirectoryReviewOtpAttempt).not.toHaveBeenCalled();
    expect(publishDirectoryReviewFromOtp).not.toHaveBeenCalled();
  });

  it("reads a lost publish race as expired, and a spent address budget as limited", async () => {
    vi.mocked(publishDirectoryReviewFromOtp).mockResolvedValueOnce(null);
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await confirmReviewOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "limited" });
  });
});

describe("readRatings and readReviews", () => {
  it("labels the top highlight and leaves out keys with no reviews", async () => {
    const gym = "gyms/thane/majiwada/iron-house";
    vi.mocked(resolveDirectoryAsk).mockResolvedValue({
      lookup: { placeIds: [], unplacedKeys: [KEY, gym] },
      readAs: new Map([
        [KEY, KEY],
        [gym, gym],
      ]),
    });
    vi.mocked(readDirectoryRatings).mockResolvedValue(new Map([[KEY, { average: 4.3, count: 3, topHighlight: { id: "quality", count: 2 } }]]));
    expect(await readRatings({ ids: [], keys: [KEY, gym] })).toEqual({
      ratings: { [KEY]: { average: 4.3, count: 3, topHighlight: { id: "quality", label: "Great quality", count: 2 } } },
    });
    expect(resolveDirectoryAsk).toHaveBeenCalledWith(DB, { ids: [], keys: [KEY, gym] });
    expect(readDirectoryRatings).toHaveBeenCalledWith(DB, { placeIds: [], unplacedKeys: [KEY, gym] });
  });

  it("reads a place once and answers under every id and key it was asked by", async () => {
    vi.mocked(resolveDirectoryAsk).mockResolvedValue({
      lookup: { placeIds: [ID], unplacedKeys: [] },
      readAs: new Map([
        [ID, ID],
        [KEY, ID],
        [OLD_KEY, ID],
      ]),
    });
    vi.mocked(readDirectoryRatings).mockResolvedValue(new Map([[ID, { average: 5, count: 2, topHighlight: null }]]));
    const summary = { average: 5, count: 2, topHighlight: null };
    expect(await readRatings({ ids: [ID], keys: [KEY, OLD_KEY] })).toEqual({ ratings: { [ID]: summary, [KEY]: summary, [OLD_KEY]: summary } });
    expect(readDirectoryRatings).toHaveBeenCalledWith(DB, { placeIds: [ID], unplacedKeys: [] });
  });

  it("returns a page of display-named reviews with the summary and page count", async () => {
    const createdAt = new Date("2026-09-28T08:00:00.000Z");
    vi.mocked(resolveDirectoryNamedForRead).mockResolvedValue({ placeId: ID, listingKey: KEY });
    vi.mocked(readDirectoryRatings).mockResolvedValue(new Map());
    vi.mocked(listPublishedDirectoryReviews).mockResolvedValue({
      reviews: [{ id: "r1", displayName: "Priya S.", rating: 5, text: null, highlights: ["clean"], helpfulCount: 4, createdAt }],
      total: 21,
    });
    const commentedAt = new Date("2026-09-28T09:30:00.000Z");
    vi.mocked(readDirectoryReviewComments).mockResolvedValue(
      new Map([
        [
          "r1",
          {
            total: 3,
            comments: [
              { id: "c1", displayName: "Rahul M.", text: "Same here.", createdAt: commentedAt, byOwner: false, edited: false },
              { id: "c2", displayName: "Smile Dental", text: "Thank you both.", createdAt: commentedAt, byOwner: true, edited: true },
            ],
          },
        ],
      ]),
    );
    expect(await readReviews({ by: "key", key: KEY }, 3)).toEqual({
      summary: null,
      reviews: [
        {
          id: "r1",
          name: "Priya S.",
          rating: 5,
          text: null,
          highlights: [{ id: "clean", label: "Clean and tidy" }],
          createdAt: createdAt.toISOString(),
          helpful: 4,
          commentCount: 3,
          comments: [
            { id: "c1", name: "Rahul M.", text: "Same here.", createdAt: commentedAt.toISOString() },
            { id: "c2", name: "Smile Dental", text: "Thank you both.", createdAt: commentedAt.toISOString(), byOwner: true, edited: true },
          ],
        },
      ],
      page: 3,
      pageCount: 3,
    });
    expect(readDirectoryReviewComments).toHaveBeenCalledWith(DB, ["r1"]);
    expect(listPublishedDirectoryReviews).toHaveBeenCalledWith(DB, { business: { placeId: ID, listingKey: KEY }, page: 3, pageSize: 10 });
    expect(readDirectoryRatings).toHaveBeenCalledWith(DB, { placeIds: [ID], unplacedKeys: [] });
  });

  it("gives a place's summary to a page asked for by id", async () => {
    vi.mocked(resolveDirectoryNamedForRead).mockResolvedValue({ placeId: ID, listingKey: null });
    vi.mocked(readDirectoryRatings).mockResolvedValue(new Map([[ID, { average: 4, count: 1, topHighlight: null }]]));
    vi.mocked(listPublishedDirectoryReviews).mockResolvedValue({ reviews: [], total: 1 });
    expect((await readReviews({ by: "id", id: ID }, 1)).summary).toEqual({ average: 4, count: 1, topHighlight: null });
    expect(resolveDirectoryNamedForRead).toHaveBeenCalledWith(DB, { by: "id", id: ID });
  });

  it("counts an empty listing as one page", async () => {
    vi.mocked(resolveDirectoryNamedForRead).mockResolvedValue({ placeId: null, listingKey: KEY });
    vi.mocked(readDirectoryRatings).mockResolvedValue(new Map());
    vi.mocked(listPublishedDirectoryReviews).mockResolvedValue({ reviews: [], total: 0 });
    expect((await readReviews({ by: "key", key: KEY }, 1)).pageCount).toBe(1);
  });
});
