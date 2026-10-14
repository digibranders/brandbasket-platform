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
import { EmailConfigurationError, type EmailMessage } from "@fynix/email";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { getPublicDb } from "./public-db";
import { notifyNewPrivacyRequest } from "./privacy-request-notify";
import { confirmPrivacyRequestOtp, requestContributionDeletion, requestPrivacyRequestOtp } from "./privacy-requests";
import { scheduleWebsiteRefresh } from "./website-refresh";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./privacy-request-notify", () => ({ notifyNewPrivacyRequest: vi.fn(async () => undefined) }));
vi.mock("./website-refresh", () => ({ scheduleWebsiteRefresh: vi.fn() }));
vi.mock("./env", () => ({ accountCodeSecret: vi.fn(), emailCodeBypassed: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn() }));
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
const INPUT = { kind: "erasure", name: "Meera", email: "meera@example.com", details: null, noticeVersion: "2026-10-13" } as const;
const REVIEW_ID = "0198f2c0-0000-7000-8000-0000000000bb";
const BAKERY = { placeId: "bakery-place", listingKey: null } as const;
const db = { transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(db) } as unknown as Database;

const PUBLIC_DB = { name: "public-db" } as unknown as Database;
const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(db);
  vi.mocked(getPublicDb).mockReturnValue(PUBLIC_DB);
  vi.mocked(accountCodeSecret).mockReturnValue(SECRET);
  vi.mocked(emailCodeBypassed).mockReturnValue(false);
  vi.mocked(customerEmailTransport).mockReturnValue({ send } as unknown as ReturnType<typeof customerEmailTransport>);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof consumeRateLimit>>);
  vi.mocked(purgeExpiredPrivacyRequestOtps).mockResolvedValue(0);
  vi.mocked(createPrivacyRequestOtp).mockImplementation(async (_db, input) => input.id);
});

describe("requestPrivacyRequestOtp", () => {
  it("holds the request with a salted hash of the code, emails the code to the address, and never stores the code itself", async () => {
    const outcome = await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW);
    expect(outcome).toMatchObject({ kind: "otp_sent", expiresInSeconds: 600, emailHint: "m•••@example.com" });
    expect(outcome).not.toHaveProperty("phoneHint");
    const stored = vi.mocked(createPrivacyRequestOtp).mock.calls[0]?.[1];
    expect(stored?.payload).toEqual({ kind: "erasure", name: "Meera", details: null, noticeVersion: "2026-10-13" });
    expect(stored?.email).toBe("meera@example.com");
    expect(stored?.expiresAt).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(customerEmailTransport).toHaveBeenCalledWith(PUBLIC_DB);
    const sent = vi.mocked(send).mock.calls[0]?.[0];
    const code = /\b(\d{6})\b/.exec(sent?.bodyText ?? "")?.[1] ?? "";
    expect(code).toHaveLength(6);
    expect(stored?.codeHash).toBe(hashOtpCode(stored?.id ?? "", code, SECRET));
    expect(stored?.codeHash).not.toContain(code);
    expect(sent).toMatchObject({ to: "meera@example.com", template: "privacy-request-code", subject: "Your privacy request confirmation code" });
  });

  it("limits by network, then by address (short and daily), then overall, each under its own key", async () => {
    await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW);
    expect(vi.mocked(consumeRateLimit).mock.calls.map((call) => call[1])).toEqual([
      "privacy-otp:ip:203.0.113.9",
      "privacy-otp:email:10m:meera@example.com",
      "privacy-otp:email:day:meera@example.com",
      "privacy-otp:all",
    ]);
  });

  it("stops at the first rate limit that is used up, and sends nothing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true } as never).mockResolvedValueOnce({ allowed: false } as never);
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "limited" });
    expect(createPrivacyRequestOtp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("reports unavailable when production has no email provider, and removes the held request when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(customerEmailTransport).mockImplementationOnce(() => {
      throw new EmailConfigurationError("BREVO_API_KEY is not set");
    });
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "unavailable" });
    expect(consumeRateLimit).not.toHaveBeenCalled();

    vi.mocked(send).mockRejectedValueOnce(new Error("gateway down"));
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
    expect(deletePrivacyRequestOtp).toHaveBeenCalledOnce();
  });

  it("still emails the code with the local bypass on, and says so without naming the person", async () => {
    vi.mocked(emailCodeBypassed).mockReturnValue(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toMatchObject({ kind: "otp_sent" });
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("meera@example.com");
  });

  it("fails without logging the person's details when the database breaks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createPrivacyRequestOtp).mockRejectedValueOnce(new Error('Failed query params: ["meera@example.com","Meera"]'));
    expect(await requestPrivacyRequestOtp(INPUT, "203.0.113.9", NOW)).toEqual({ kind: "failed" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("meera@example.com");
  });
});

describe("requestContributionDeletion", () => {
  const target = { kind: "comment", id: REVIEW_ID } as const;
  const visitor = { target, phone: "+919876543210", noticeVersion: null } as const;

  it("deletes at once for a recognised visitor, refreshes the page, and sends nothing to anyone", async () => {
    vi.mocked(deleteContributionForProvenNumber).mockResolvedValue({ id: "id", reference: "PR-DELETED1", business: BAKERY });
    const outcome = await requestContributionDeletion(visitor, NOW);
    expect(outcome).toEqual({ kind: "deleted", reference: "PR-DELETED1" });
    expect(deleteContributionForProvenNumber).toHaveBeenCalledWith(db, { phone: "+919876543210", target, now: NOW, dueAt: new Date("2026-12-01T06:00:00.000Z") });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(BAKERY);
    expect(send).not.toHaveBeenCalled();
    expect(createPrivacyRequestOtp).not.toHaveBeenCalled();
  });

  it("answers not found for something the visitor did not post, and failed on an error", async () => {
    vi.mocked(deleteContributionForProvenNumber).mockResolvedValueOnce(null);
    expect(await requestContributionDeletion(visitor, NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(deleteContributionForProvenNumber).mockRejectedValueOnce(new Error("database down"));
    expect(await requestContributionDeletion(visitor, NOW)).toEqual({ kind: "failed" });
  });
});

describe("confirmPrivacyRequestOtp", () => {
  const row = (overrides: Partial<PrivacyRequestOtpRow> = {}): PrivacyRequestOtpRow => ({
    id: OTP_ID,
    email: "meera@example.com",
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
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ id: "id", reference: "PR-REPORT01", dueAt });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "received", reference: "PR-REPORT01", dueAt });
    expect(receiveVerifiedPrivacyRequest).toHaveBeenCalledWith(db, { otpId: OTP_ID, maxAttempts: 5, now: NOW, dueAt });
  });

  it("files the request for the right code, due 30 days from now", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ id: "id", reference: "PR-7K2M9QXD", dueAt });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "123456", "203.0.113.9", NOW)).toEqual({ kind: "received", reference: "PR-7K2M9QXD", dueAt });
    expect(receiveVerifiedPrivacyRequest).toHaveBeenCalledWith(db, { otpId: OTP_ID, maxAttempts: 5, now: NOW, dueAt });
    expect(notifyNewPrivacyRequest).toHaveBeenCalledWith({ reference: "PR-7K2M9QXD", kind: "erasure", dueAt });
  });

  it("still files the request when the alert cannot be sent, and sends no alert for a request that was not filed", async () => {
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ id: "id", reference: "PR-7K2M9QXD", dueAt });
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

  it("accepts any six digits with the local bypass on, but still claims the attempt", async () => {
    vi.mocked(emailCodeBypassed).mockReturnValue(true);
    vi.mocked(findPrivacyRequestOtp).mockResolvedValue(row());
    vi.mocked(claimPrivacyRequestOtpAttempt).mockResolvedValue({ attempts: 1 });
    vi.mocked(receiveVerifiedPrivacyRequest).mockResolvedValue({ id: "id", reference: "PR-7K2M9QXD", dueAt: NOW });
    expect(await confirmPrivacyRequestOtp(OTP_ID, "999999", "203.0.113.9", NOW)).toMatchObject({ kind: "received" });
    expect(claimPrivacyRequestOtpAttempt).toHaveBeenCalledOnce();
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
