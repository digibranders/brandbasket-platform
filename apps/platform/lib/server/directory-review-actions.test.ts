import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDirectoryReviewOtpAttempt,
  consumeRateLimit,
  createDirectoryCommentOtp,
  deleteDirectoryReviewOtp,
  findDirectoryReviewOtp,
  findPublishedDirectoryReviewForComment,
  incrementDirectoryReviewHelpful,
  publishDirectoryCommentFromOtp,
  purgeExpiredDirectoryReviewOtps,
  readDirectoryReviewHelpful,
  type Database,
  type DirectoryReviewOtpRow,
} from "@fynix/db";
import { getStaffDb } from "./db";
import { bookingOtpBypassed, bookingOtpSecret, smsAllowedCountryCodes } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { createSmsSender, otpMessage, SmsProviderUnavailableError } from "./sms";
import type { CommentInput } from "./directory-fields";
import { startVisitorSession, type ResolvedVisitor } from "./directory-visitor";
import { recordContributionConsent } from "./visitor-consent";
import { confirmCommentOtp, markReviewHelpful, publishCommentAsVisitor, requestCommentOtp } from "./directory-review-actions";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./directory-visitor", () => ({ startVisitorSession: vi.fn(async () => undefined) }));
vi.mock("./visitor-consent", () => ({ recordContributionConsent: vi.fn() }));
vi.mock("./env", () => ({ bookingOtpSecret: vi.fn(), bookingOtpBypassed: vi.fn(), smsAllowedCountryCodes: vi.fn() }));
vi.mock("./sms", async () => {
  const actual = await vi.importActual<typeof import("./sms")>("./sms");
  return { createSmsSender: vi.fn(), otpMessage: actual.otpMessage, SmsProviderUnavailableError: actual.SmsProviderUnavailableError };
});
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return {
    // Used by ./directory-signals (visitorHash's module) at import time.
    ...actual,
    claimDirectoryReviewOtpAttempt: vi.fn(),
    consumeRateLimit: vi.fn(),
    createDirectoryCommentOtp: vi.fn(),
    deleteDirectoryReviewOtp: vi.fn(),
    findDirectoryReviewOtp: vi.fn(),
    findPublishedDirectoryReviewForComment: vi.fn(),
    incrementDirectoryReviewHelpful: vi.fn(),
    publishDirectoryCommentFromOtp: vi.fn(),
    purgeExpiredDirectoryReviewOtps: vi.fn(),
    readDirectoryReviewHelpful: vi.fn(),
  };
});

const SECRET = "test-secret-with-enough-length-for-hmac";
const NOW = new Date("2026-10-08T10:00:00.000Z");
const REVIEW_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DB = {} as Database;

const INPUT: CommentInput = { reviewId: REVIEW_ID, name: "Rahul Mehta", text: "Same experience here.", phone: "+919876543210" };
const REVIEW = { id: REVIEW_ID, listingKey: "dentists/thane/naupada/smile-dental", placeId: null };

const send = vi.fn<(message: { to: string; body: string; businessId: string | null }) => Promise<void>>();

function otpRow(overrides: Partial<DirectoryReviewOtpRow> = {}): DirectoryReviewOtpRow {
  return {
    id: OTP_ID,
    listingKey: REVIEW.listingKey,
    placeId: null,
    reviewId: REVIEW_ID,
    phone: INPUT.phone,
    codeHash: hashOtpCode(OTP_ID, "123456", SECRET),
    payload: { commenterName: "Rahul Mehta", text: "Same experience here." } as unknown as DirectoryReviewOtpRow["payload"],
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
  vi.mocked(bookingOtpSecret).mockReturnValue(SECRET);
  vi.mocked(bookingOtpBypassed).mockReturnValue(false);
  vi.mocked(smsAllowedCountryCodes).mockReturnValue(["91"]);
  vi.mocked(createSmsSender).mockReturnValue({ send });
  send.mockResolvedValue(undefined);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(purgeExpiredDirectoryReviewOtps).mockResolvedValue(0);
  vi.mocked(findPublishedDirectoryReviewForComment).mockResolvedValue(REVIEW);
});

describe("markReviewHelpful", () => {
  it("counts the first mark of the week and answers with the new count", async () => {
    vi.mocked(incrementDirectoryReviewHelpful).mockResolvedValue(5);
    expect(await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW)).toEqual({ kind: "counted", helpful: 5 });
    expect(incrementDirectoryReviewHelpful).toHaveBeenCalledWith(DB, REVIEW_ID);
    expect(readDirectoryReviewHelpful).not.toHaveBeenCalled();
  });

  it("answers a repeat with the count as it stands, without counting again", async () => {
    vi.mocked(consumeRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 59, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 3600 });
    vi.mocked(readDirectoryReviewHelpful).mockResolvedValue(4);
    expect(await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW)).toEqual({ kind: "counted", helpful: 4 });
    expect(incrementDirectoryReviewHelpful).not.toHaveBeenCalled();
  });

  it("refuses an address over its hourly ceiling before touching the review", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW)).toEqual({ kind: "limited" });
    expect(incrementDirectoryReviewHelpful).not.toHaveBeenCalled();
  });

  it("reads a review that is not published as unknown", async () => {
    vi.mocked(incrementDirectoryReviewHelpful).mockResolvedValue(null);
    expect(await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW)).toEqual({ kind: "unknown_review" });
  });

  it("never keys a rate limit by the raw address", async () => {
    vi.mocked(incrementDirectoryReviewHelpful).mockResolvedValue(1);
    await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW);
    for (const [, key] of vi.mocked(consumeRateLimit).mock.calls) expect(key).not.toContain("203.0.113.9");
  });

  it("answers failed, without the visitor's address in the log, when the database fails", async () => {
    vi.mocked(consumeRateLimit).mockRejectedValue(new Error("connection reset"));
    expect(await markReviewHelpful(REVIEW_ID, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("203.0.113.9");
  });
});

describe("requestCommentOtp", () => {
  it("stores the comment with a hashed code and texts the code", async () => {
    const outcome = await requestCommentOtp(INPUT, "203.0.113.9", NOW);
    expect(outcome).toMatchObject({ kind: "otp_sent", expiresInSeconds: 600 });
    const created = vi.mocked(createDirectoryCommentOtp).mock.calls[0]?.[1];
    expect(created).toMatchObject({ review: REVIEW, phone: INPUT.phone, payload: { commenterName: "Rahul Mehta", text: "Same experience here." } });
    expect(created?.codeHash).not.toContain("123456");
    const sent = send.mock.calls[0]?.[0];
    expect(sent?.to).toBe(INPUT.phone);
    expect(sent?.body).toMatch(/^\d{6} is your Fynix code\./);
    expect(sent?.body).toBe(otpMessage(sent?.body.slice(0, 6) ?? ""));
  });

  it("sends nothing in bypass mode, and the code still waits", async () => {
    vi.mocked(bookingOtpBypassed).mockReturnValue(true);
    expect((await requestCommentOtp(INPUT, "203.0.113.9", NOW)).kind).toBe("otp_sent");
    expect(createSmsSender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(createDirectoryCommentOtp).toHaveBeenCalledTimes(1);
  });

  it("is unavailable when production has no SMS provider, before any rate limit is spent", async () => {
    vi.mocked(createSmsSender).mockImplementation(() => {
      throw new SmsProviderUnavailableError();
    });
    expect(await requestCommentOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "unavailable" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("refuses a phone country that is not on the allow-list, before any rate limit is spent", async () => {
    vi.mocked(smsAllowedCountryCodes).mockReturnValue(["44"]);
    expect(await requestCommentOtp(INPUT, "203.0.113.9", NOW)).toMatchObject({ kind: "invalid", field: "phone" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("reads a review that is not published as unknown, before any rate limit is spent", async () => {
    vi.mocked(findPublishedDirectoryReviewForComment).mockResolvedValue(null);
    expect(await requestCommentOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "unknown_review" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(createDirectoryCommentOtp).not.toHaveBeenCalled();
  });

  it("is limited when any budget is spent, and stores and sends nothing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 }).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await requestCommentOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "limited" });
    expect(createDirectoryCommentOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("takes the code back when the text cannot be sent", async () => {
    send.mockRejectedValue(new Error("provider down"));
    expect(await requestCommentOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
    expect(deleteDirectoryReviewOtp).toHaveBeenCalledTimes(1);
  });
});

describe("what a commenter agreed to", () => {
  const CONSENT = { noticeVersion: "pre-dpdp", adult: true } as const;

  it("is kept with the held comment, and left out of one that carried none", async () => {
    await requestCommentOtp({ ...INPUT, consent: CONSENT }, "203.0.113.9", NOW);
    expect(vi.mocked(createDirectoryCommentOtp).mock.calls[0]?.[1].payload).toMatchObject({ consent: CONSENT });
    await requestCommentOtp(INPUT, "203.0.113.9", NOW);
    expect(vi.mocked(createDirectoryCommentOtp).mock.calls[1]?.[1].payload).not.toHaveProperty("consent");
  });

  it("is recorded against the visitor account opened when the code is confirmed", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(
      otpRow({ payload: { commenterName: "Rahul Mehta", text: "Same.", consent: CONSENT } as unknown as DirectoryReviewOtpRow["payload"] }),
    );
    vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(publishDirectoryCommentFromOtp).mockResolvedValue({ commentId: "c1", reviewId: REVIEW_ID });
    await confirmCommentOtp(OTP_ID, "123456", "203.0.113.9", NOW);
    expect(startVisitorSession).toHaveBeenCalledWith(INPUT.phone, "Rahul Mehta", NOW, CONSENT);
  });

  it("is recorded against a recognised visitor's account when their comment is published without a code", async () => {
    const visitor = { id: "visitor-1", identity: { name: "Rahul Mehta", phone: INPUT.phone }, session: { token: "t", name: "Rahul Mehta", phoneHint: "x" } } as ResolvedVisitor;
    vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(publishDirectoryCommentFromOtp).mockResolvedValue({ commentId: "c1", reviewId: REVIEW_ID });
    expect(await publishCommentAsVisitor({ ...INPUT, consent: CONSENT }, visitor, "203.0.113.9", NOW)).toMatchObject({ kind: "published" });
    expect(recordContributionConsent).toHaveBeenCalledWith(DB, "visitor-1", CONSENT);
  });
});

describe("confirmCommentOtp", () => {
  beforeEach(() => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(otpRow());
    vi.mocked(claimDirectoryReviewOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(publishDirectoryCommentFromOtp).mockResolvedValue({ commentId: "c1", reviewId: REVIEW_ID });
  });

  it("publishes the comment when the code matches", async () => {
    expect(await confirmCommentOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "published" });
    expect(publishDirectoryCommentFromOtp).toHaveBeenCalledWith(DB, { otpId: OTP_ID, maxAttempts: 5, now: NOW });
  });

  it("tells a wrong code how many tries are left, and publishes nothing", async () => {
    expect(await confirmCommentOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toEqual({ kind: "wrong_code", message: "That code isn't right. 4 tries left." });
    expect(publishDirectoryCommentFromOtp).not.toHaveBeenCalled();
  });

  it("accepts any six digits in bypass mode", async () => {
    vi.mocked(bookingOtpBypassed).mockReturnValue(true);
    expect(await confirmCommentOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toEqual({ kind: "published" });
  });

  it("never confirms a review's code as a comment: a code naming no review reads as expired", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(otpRow({ reviewId: null }));
    expect(await confirmCommentOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
    expect(claimDirectoryReviewOtpAttempt).not.toHaveBeenCalled();
  });

  it("reads a missing, used or expired code as expired", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(null);
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ verifiedAt: NOW }));
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findDirectoryReviewOtp).mockResolvedValueOnce(otpRow({ expiresAt: NOW }));
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
  });

  it("reads an exhausted code as too many attempts, without claiming another", async () => {
    vi.mocked(findDirectoryReviewOtp).mockResolvedValue(otpRow({ attempts: 5 }));
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toMatchObject({ kind: "too_many_attempts" });
    expect(claimDirectoryReviewOtpAttempt).not.toHaveBeenCalled();
  });

  it("reads a review hidden since the code was asked for as expired", async () => {
    vi.mocked(publishDirectoryCommentFromOtp).mockResolvedValue(null);
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "expired" });
  });

  it("is limited when the address has confirmed too many codes", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await confirmCommentOtp(OTP_ID, "123456", "ip", NOW)).toEqual({ kind: "limited" });
    expect(findDirectoryReviewOtp).not.toHaveBeenCalled();
  });
});
