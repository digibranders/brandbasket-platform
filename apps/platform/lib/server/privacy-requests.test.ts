import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPrivacyRequestOtpAttempt,
  consumeRateLimit,
  createPrivacyRequestOtp,
  deleteContributionForProvenNumber,
  deletePrivacyRequestOtp,
  findPrivacyRequestOtp,
  purgeExpiredPrivacyRequestOtps,
  receiveVerifiedPrivacyRequest,
  type Database,
  type PrivacyRequestOtpRow,
} from "@fynix/db";
import { getStaffDb } from "./db";
import { bookingOtpBypassed, bookingOtpSecret, smsAllowedCountryCodes } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { createSmsSender, SmsProviderUnavailableError } from "./sms";
import { notifyNewPrivacyRequest } from "./privacy-request-notify";
import { confirmPrivacyRequestOtp, requestContributionDeletion, requestPrivacyRequestOtp } from "./privacy-requests";
import { scheduleWebsiteRefresh } from "./website-refresh";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./privacy-request-notify", () => ({ notifyNewPrivacyRequest: vi.fn(async () => undefined) }));
vi.mock("./website-refresh", () => ({ scheduleWebsiteRefresh: vi.fn() }));
vi.mock("./env", () => ({ bookingOtpSecret: vi.fn(), bookingOtpBypassed: vi.fn(), smsAllowedCountryCodes: vi.fn() }));
vi.mock("./sms", async () => {
  const actual = await vi.importActual<typeof import("./sms")>("./sms");
  return { createSmsSender: vi.fn(), otpMessage: actual.otpMessage, SmsProviderUnavailableError: actual.SmsProviderUnavailableError };
});
vi.mock("@fynix/db", () => ({
  claimPrivacyRequestOtpAttempt: vi.fn(),
  consumeRateLimit: vi.fn(),
  createPrivacyRequestOtp: vi.fn(),
  deleteContributionForProvenNumber: vi.fn(),
  deletePrivacyRequestOtp: vi.fn(),
  findPrivacyRequestOtp: vi.fn(),
  purgeExpiredPrivacyRequestOtps: vi.fn(),
  receiveVerifiedPrivacyRequest: vi.fn(),
}));

const SECRET = "s".repeat(32);
const NOW = new Date("2026-11-01T06:00:00.000Z");
const OTP_ID = "0198f2c0-0000-7000-8000-000000000001";
const INPUT = { kind: "erasure", name: "Meera", phone: "+919876543210", details: null, noticeVersion: "2026-10-13" } as const;
const REVIEW_ID = "0198f2c0-0000-7000-8000-0000000000bb";
const DENTIST = { placeId: null, listingKey: "dentists/thane/naupada/smile-dental" } as const;
const BAKERY = { placeId: "bakery-place", listingKey: null } as const;
const db = { transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(db) } as unknown as Database;

const send = vi.fn<(message: { readonly to: string; readonly body: string }) => Promise<void>>(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(db);
  vi.mocked(bookingOtpSecret).mockReturnValue(SECRET);
  vi.mocked(bookingOtpBypassed).mockReturnValue(false);
  vi.mocked(smsAllowedCountryCodes).mockReturnValue(["91"]);
  vi.mocked(createSmsSender).mockReturnValue({ send } as unknown as ReturnType<typeof createSmsSender>);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof consumeRateLimit>>);
  vi.mocked(purgeExpiredPrivacyRequestOtps).mockResolvedValue(0);
  vi.mocked(createPrivacyRequestOtp).mockImplementation(async (_db, input) => input.id);
});

describe("requestPrivacyRequestOtp", () => {
  it("holds the request with a salted hash of the code, texts the code, and never stores the code itself", async () => {
    const outcome = await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW);
    expect(outcome).toMatchObject({ kind: "otp_sent", expiresInSeconds: 600, phoneHint: "•••• 3210" });
    const stored = vi.mocked(createPrivacyRequestOtp).mock.calls[0]?.[1];
    expect(stored?.payload).toEqual({ kind: "erasure", name: "Meera", details: null, noticeVersion: "2026-10-13" });
    expect(stored?.phone).toBe("+919876543210");
    expect(stored?.expiresAt).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    const sent = vi.mocked(send).mock.calls[0];
    const code = /^(\d{6})/.exec(sent?.[0].body)?.[1] ?? "";
    expect(code).toHaveLength(6);
    expect(stored?.codeHash).toBe(hashOtpCode(stored?.id ?? "", code, SECRET));
    expect(stored?.codeHash).not.toContain(code);
    expect(sent?.[0].to).toBe("+919876543210");
  });

  it("refuses a number outside the allowed countries before spending any rate limit or sending anything", async () => {
    const outcome = await requestPrivacyRequestOtp({ ...INPUT, phone: "+14155550123" }, "203.0.113.9", NOW);
    expect(outcome).toMatchObject({ kind: "invalid", field: "phone" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("stops at the first rate limit that is used up, and sends nothing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true } as never).mockResolvedValueOnce({ allowed: false } as never);
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "limited" });
    expect(createPrivacyRequestOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("reports unavailable when production has no SMS provider, and removes the held request when sending fails", async () => {
    vi.mocked(createSmsSender).mockImplementationOnce(() => {
      throw new SmsProviderUnavailableError();
    });
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "unavailable" });

    vi.mocked(send).mockRejectedValueOnce(new Error("gateway down"));
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
    expect(deletePrivacyRequestOtp).toHaveBeenCalledOnce();
  });

  it("sends nothing with the bypass on", async () => {
    vi.mocked(bookingOtpBypassed).mockReturnValue(true);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toMatchObject({ kind: "otp_sent" });
    expect(createSmsSender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("requestContributionDeletion", () => {
  const target = { kind: "comment", id: REVIEW_ID } as const;

  it("texts a code to a number, holding only the target and the notice version, nothing else", async () => {
    const outcome = await requestContributionDeletion({ target, requester: { kind: "number", phone: "+919876543210" }, noticeVersion: "2026-10-13" }, "203.0.113.9", NOW);
    expect(outcome).toMatchObject({ kind: "otp_sent", phoneHint: "•••• 3210" });
    expect(vi.mocked(createPrivacyRequestOtp).mock.calls[0]?.[1].payload).toEqual({ kind: "contribution_deletion", name: null, details: null, noticeVersion: "2026-10-13", target });
    expect(deleteContributionForProvenNumber).not.toHaveBeenCalled();
  });

  it("deletes at once for a recognised visitor, refreshes the page, and texts nothing", async () => {
    vi.mocked(deleteContributionForProvenNumber).mockResolvedValue({ id: "id", reference: "PR-DELETED1", business: BAKERY });
    const outcome = await requestContributionDeletion({ target, requester: { kind: "visitor", phone: "+919876543210" }, noticeVersion: null }, "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "deleted", reference: "PR-DELETED1" });
    expect(deleteContributionForProvenNumber).toHaveBeenCalledWith(db, { phone: "+919876543210", target, now: NOW, dueAt: new Date("2026-12-01T06:00:00.000Z") });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(BAKERY);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers not found for a recognised visitor's request about something they did not post, and failed on an error", async () => {
    vi.mocked(deleteContributionForProvenNumber).mockResolvedValueOnce(null);
    const input = { target, requester: { kind: "visitor", phone: "+919876543210" }, noticeVersion: null } as const;
    expect(await requestContributionDeletion(input, "203.0.113.9", NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(deleteContributionForProvenNumber).mockRejectedValueOnce(new Error("database down"));
    expect(await requestContributionDeletion(input, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
  });
});

describe("confirmPrivacyRequestOtp", () => {
  const row = (overrides: Partial<PrivacyRequestOtpRow> = {}): PrivacyRequestOtpRow => ({
    id: OTP_ID,
    phone: "+919876543210",
    codeHash: hashOtpCode(OTP_ID, "123456", SECRET),
    payload: { kind: "erasure", name: "Meera", details: null, noticeVersion: null },
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    verifiedAt: null,
    ...overrides,
  });

  it("makes a report about posted content due in 15 days, the IT Rules limit", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row({ payload: { kind: "content_report", name: null, details: "About: x", noticeVersion: null } }));
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    const dueAt = new Date("2026-11-16T06:00:00.000Z");
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ outcome: "filed", id: "id", reference: "PR-REPORT01", dueAt });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "received", reference: "PR-REPORT01", dueAt });
    expect(receiveVerifiedPrivacyRequest).toHaveBeenCalledWith(db, { otpId: OTP_ID, maxAttempts: 5, now: NOW, dueAt });
  });

  it("files the request for the right code, due 30 days from now", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ outcome: "filed", id: "id", reference: "PR-7K2M9QXD", dueAt });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "received", reference: "PR-7K2M9QXD", dueAt });
    expect(receiveVerifiedPrivacyRequest).toHaveBeenCalledWith(db, { otpId: OTP_ID, maxAttempts: 5, now: NOW, dueAt });
    expect(notifyNewPrivacyRequest).toHaveBeenCalledWith({ reference: "PR-7K2M9QXD", kind: "erasure", dueAt });
  });

  it("reports a visitor erasure as done, refreshes every page it changed, and sends no alert for it", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row({ payload: { kind: "visitor_erasure", name: null, details: null, noticeVersion: "2026-10-13" } }));
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({
      outcome: "erased",
      id: "id",
      reference: "PR-ERASED01",
      erased: { accountDeleted: true, reviews: 2, comments: 1, enquiries: 3, businesses: [DENTIST, BAKERY] },
    });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "erased", reference: "PR-ERASED01", reviews: 2, comments: 1, enquiries: 3 });
    expect(vi.mocked(scheduleWebsiteRefresh).mock.calls).toEqual([[DENTIST], [BAKERY]]);
    expect(notifyNewPrivacyRequest).not.toHaveBeenCalled();
  });

  it("reports one review or comment deleted and refreshes its page, or not found, with no alert either way", async () => {
    const target = { kind: "review", id: REVIEW_ID } as const;
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row({ payload: { kind: "contribution_deletion", name: null, details: null, noticeVersion: "2026-10-13", target } }));
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValueOnce({ outcome: "deleted", id: "id", reference: "PR-DELETED1", business: DENTIST });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "deleted", reference: "PR-DELETED1" });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(DENTIST);

    vi.mocked(scheduleWebsiteRefresh).mockClear();
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValueOnce({ outcome: "not_found" });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();
    expect(notifyNewPrivacyRequest).not.toHaveBeenCalled();
  });

  it("still files the request when the alert cannot be sent, and sends no alert for a request that was not filed", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ outcome: "filed", id: "id", reference: "PR-7K2M9QXD", dueAt });
    vi.mocked(notifyNewPrivacyRequest).mockRejectedValueOnce(new Error("mail down"));
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toMatchObject({ kind: "received" });

    vi.mocked(notifyNewPrivacyRequest).mockClear();
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue(null);
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
    expect(notifyNewPrivacyRequest).not.toHaveBeenCalled();
  });

  it("says how many tries are left for a wrong code, and files nothing", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 4 });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toEqual({ kind: "wrong_code", message: "That code is not right. 1 try left." });
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 5 });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "000000", "203.0.113.9", NOW)).toMatchObject({ kind: "too_many_attempts" });
    expect(receiveVerifiedPrivacyRequest).not.toHaveBeenCalled();
  });

  it("treats an unknown, used or expired code as expired, and a spent one as too many attempts", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValueOnce(null);
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findPrivacyRequestOtp).mockResolvedValueOnce(row({ verifiedAt: NOW }));
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findPrivacyRequestOtp).mockResolvedValueOnce(row({ expiresAt: NOW }));
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
    vi.mocked(findPrivacyRequestOtp).mockResolvedValueOnce(row({ attempts: 5 }));
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toMatchObject({ kind: "too_many_attempts" });
    expect(claimPrivacyRequestOtpAttempt).not.toHaveBeenCalled();
  });

  it("is limited when the address has confirmed too many times, and expired when another confirm used the code first", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false } as never);
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "limited" });

    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue(null);
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "expired" });
  });
});
