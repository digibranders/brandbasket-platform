import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findClaimForBusiness,
  readDirectoryStatuses,
  upsertDirectoryVerification,
  withTenantScope,
  type Database,
  type DirectoryClaim,
} from "@firstfold/db";
import { confirmAccountOtp, requestAccountOtp } from "./account-otp";
import { getAppDb, getStaffDb } from "./db";
import { confirmOwnerVerification, ownerVerificationState, requestOwnerVerification } from "./owner-verification";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./account-otp", () => ({ requestAccountOtp: vi.fn(), confirmAccountOtp: vi.fn() }));
vi.mock("@firstfold/db", () => ({
  findClaimForBusiness: vi.fn(),
  readDirectoryStatuses: vi.fn(),
  upsertDirectoryVerification: vi.fn(),
  withTenantScope: vi.fn(),
}));

const APP_DB = { app: true } as unknown as Database;
const STAFF_DB = { staff: true } as unknown as Database;
const TENANT = { userId: "user-1", businessId: "biz-1", businessName: "Smile Dental", role: "owner" } as const;
const CUSTOMER = { tenant: TENANT };
const IP = "203.0.113.9";
const NOW = new Date("2026-10-06T10:00:00.000Z");
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const PLACE = "k7m2q9a";

function claim(overrides: Partial<DirectoryClaim> = {}): DirectoryClaim {
  return {
    id: "c1",
    businessId: TENANT.businessId,
    listingKey: "dentists/thane/naupada/smile-dental",
    placeId: PLACE,
    businessName: "Smile Dental",
    phone: "+919876543210",
    origin: "claimed",
    streetAddress: null,
    pincode: null,
    localityName: null,
    websiteUrl: null,
    status: "approved",
    decidedAt: null,
    publishedAt: null,
    tagline: null,
    taglineApproved: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(APP_DB);
  vi.mocked(getStaffDb).mockReturnValue(STAFF_DB);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work({} as never));
  vi.mocked(findClaimForBusiness).mockResolvedValue(claim());
  vi.mocked(readDirectoryStatuses).mockResolvedValue(new Map());
  vi.mocked(upsertDirectoryVerification).mockResolvedValue({ replaced: false });
});

describe("ownerVerificationState", () => {
  it("is ready, with the number's hint, for a business that has not been verified", async () => {
    expect(await ownerVerificationState(CUSTOMER)).toEqual({ kind: "ready", phoneHint: "•••• 3210" });
    expect(readDirectoryStatuses).toHaveBeenCalledWith(STAFF_DB, { placeIds: [PLACE], unplacedKeys: [] });
  });

  it("is verified, with the date, once it has been", async () => {
    const verifiedAt = new Date("2026-10-05T00:00:00Z");
    vi.mocked(readDirectoryStatuses).mockResolvedValue(new Map([[PLACE, { verifiedAt, phone: "+919876543210", trusted: false }]]));
    expect(await ownerVerificationState(CUSTOMER)).toEqual({ kind: "verified", verifiedAt });
  });

  it("is unavailable, with the reason, when the business cannot verify yet", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue(null);
    expect(await ownerVerificationState(CUSTOMER)).toEqual({ kind: "unavailable", refusal: "no_listing" });
    vi.mocked(findClaimForBusiness).mockResolvedValue(claim({ status: "rejected" }));
    expect(await ownerVerificationState(CUSTOMER)).toEqual({ kind: "unavailable", refusal: "rejected" });
  });
});

describe("requestOwnerVerification", () => {
  it("asks for a code to the number the business gave, for a business verification", async () => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 3210", texted: false });
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({
      kind: "sent",
      otpId: OTP_ID,
      phoneHint: "•••• 3210",
      texted: false,
    });
    expect(requestAccountOtp).toHaveBeenCalledWith({ purpose: "verify_business", phone: "+919876543210", send: true }, IP, NOW);
  });

  it("asks for nothing when the business cannot verify", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue(claim({ placeId: null }));
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "refused", refusal: "no_place" });
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  it("asks for nothing when the business is already verified", async () => {
    vi.mocked(readDirectoryStatuses).mockResolvedValue(new Map([[PLACE, { verifiedAt: NOW, phone: null, trusted: false }]]));
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "already_verified" });
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  it("passes on the code step's own refusals", async () => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 60 });
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "unavailable" });
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "unavailable" });
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "invalid", message: "We only text Indian numbers." });
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "invalid", message: "We only text Indian numbers." });
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "failed" });
    expect(await requestOwnerVerification(CUSTOMER, IP, NOW)).toEqual({ kind: "failed" });
  });
});

describe("confirmOwnerVerification", () => {
  const input = { otpId: OTP_ID, code: "123456" };

  it("marks the business verified, by its owner, once the code is right", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "confirmed" });
    expect(await confirmOwnerVerification(CUSTOMER, input, IP, NOW)).toEqual({ kind: "verified" });
    expect(confirmAccountOtp).toHaveBeenCalledWith({ ...input, purpose: "verify_business", phone: "+919876543210" }, IP, NOW);
    expect(upsertDirectoryVerification).toHaveBeenCalledWith(STAFF_DB, {
      listingKey: "dentists/thane/naupada/smile-dental",
      businessName: "Smile Dental",
      phone: "+919876543210",
      staffUserId: TENANT.userId,
      now: NOW,
    });
  });

  it.each([
    [{ kind: "wrong_code", triesLeft: 3 }],
    [{ kind: "wrong_code", triesLeft: null }],
    [{ kind: "expired" }],
    [{ kind: "limited", scope: "network", retryAfterSeconds: 60 }],
  ] as const)("verifies nothing on %j", async (outcome) => {
    vi.mocked(confirmAccountOtp).mockResolvedValue(outcome);
    expect(await confirmOwnerVerification(CUSTOMER, input, IP, NOW)).toEqual(outcome);
    expect(upsertDirectoryVerification).not.toHaveBeenCalled();
  });

  it("checks the code before the business, and refuses a business that cannot verify without using the code", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue(claim({ status: "rejected" }));
    expect(await confirmOwnerVerification(CUSTOMER, input, IP, NOW)).toEqual({ kind: "refused", refusal: "rejected" });
    expect(confirmAccountOtp).not.toHaveBeenCalled();
    expect(upsertDirectoryVerification).not.toHaveBeenCalled();
  });
});
