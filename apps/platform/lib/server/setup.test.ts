import { headers } from "next/headers";
import type { Auth } from "@fynix/auth";
import { AccountAlreadyExistsError, createAccountWithGrant, isInvalidCredentialsError } from "@fynix/auth";
import {
  consumeRateLimit,
  findRedeemableInvite,
  redeemInviteIntoBusiness,
  type Database,
  type RateLimitResult,
  type SetupInvite,
} from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAccountTermsConsent } from "./account-consent";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { findInviteForToken, redeemSetupInvite, TermsNotAgreedError, TooManySetupAttemptsError } from "./setup";

// Same approach as sign-in.test.ts: the database, Better Auth and the incoming request are all test doubles, so
// the module's own decisions run in isolation. `@fynix/auth` is mocked rather than used for real because
// better-auth is not a direct dependency of this package; the mocked AccountAlreadyExistsError is a real class,
// because the recovery path turns on `instanceof`.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@fynix/auth", () => ({
  AccountAlreadyExistsError: class AccountAlreadyExistsError extends Error {
    constructor(email: string) {
      super(`An account for ${email} already exists.`);
      this.name = "AccountAlreadyExistsError";
    }
  },
  createAccountWithGrant: vi.fn(),
  isInvalidCredentialsError: vi.fn(),
}));
vi.mock("@fynix/db", () => ({
  consumeRateLimit: vi.fn(),
  findRedeemableInvite: vi.fn(),
  redeemInviteIntoBusiness: vi.fn(),
}));
vi.mock("./account-consent", () => ({ recordAccountTermsConsent: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
// Signing in goes straight through to Better Auth here (customer-sign-in.test.ts covers the wrapper), so these tests check the sign-in itself.
vi.mock("./customer-sign-in", async () => {
  const { getAuth } = await import("./auth");
  return {
    signInCustomer: vi.fn(async (credentials: { email: string; password: string }, headers: Headers) => {
      const result = await getAuth().api.signInEmail({ body: { ...credentials }, headers });
      return { userId: result?.user.id };
    }),
  };
});
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));

const mockedHeaders = vi.mocked(headers);
const mockedCreateAccount = vi.mocked(createAccountWithGrant);
const mockedIsInvalidCredentialsError = vi.mocked(isInvalidCredentialsError);
const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedFindRedeemableInvite = vi.mocked(findRedeemableInvite);
const mockedRedeemInvite = vi.mocked(redeemInviteIntoBusiness);
const mockedGetAuth = vi.mocked(getAuth);
const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedSyncTenant = vi.mocked(syncTenantForBusiness);

const ALLOWED: RateLimitResult = { allowed: true, remaining: 10, retryAfterSeconds: 0 };
const BLOCKED: RateLimitResult = { allowed: false, remaining: 0, retryAfterSeconds: 120 };

const INVITE: SetupInvite = {
  id: "invite-1",
  leadId: "lead-1",
  // Stored as staff typed it: the module normalises before it reaches Better Auth or a rate-limit key.
  email: "Owner@Example.com",
  businessName: "Riverside Plumbing",
  tokenHash: "hash",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
};
const NORMALISED_EMAIL = "owner@example.com";
const ACCOUNT = { name: "Riley Owner", password: "correct-horse-battery", agreed: true as const };

/** The three sign-in limits plus the redemption budget the recovery path spends before checking a password. */
const RECOVERY_LIMIT_CHECKS = 4;

describe("setup redemption", () => {
  const signInEmail = vi.fn();
  const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

  beforeEach(() => {
    vi.resetAllMocks();
    mockedHeaders.mockResolvedValue(requestHeaders);
    mockedGetStaffDb.mockReturnValue({} as unknown as Database);
    mockedGetAuth.mockReturnValue({ api: { signInEmail } } as unknown as Auth);
    mockedConsumeRateLimit.mockResolvedValue(ALLOWED);
    mockedIsInvalidCredentialsError.mockReturnValue(false);
    mockedFindRedeemableInvite.mockResolvedValue(INVITE);
    mockedCreateAccount.mockResolvedValue({ userId: "customer-1", email: NORMALISED_EMAIL });
    mockedRedeemInvite.mockResolvedValue({ businessId: "business-1" });
    mockedSyncTenant.mockResolvedValue(undefined);
    signInEmail.mockResolvedValue({ user: { id: "customer-1" } });
  });

  it("creates the account, redeems the invite and signs the customer in", async () => {
    await redeemSetupInvite("token", ACCOUNT);

    expect(mockedRedeemInvite).toHaveBeenCalledWith(expect.anything(), {
      inviteId: INVITE.id,
      leadId: INVITE.leadId,
      businessName: INVITE.businessName,
      userId: "customer-1",
    });
    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: NORMALISED_EMAIL, password: ACCOUNT.password },
      headers: requestHeaders,
    });
  });

  it("keeps proof that the new owner agreed to the Terms and Privacy Notice, against the account just made", async () => {
    await redeemSetupInvite("token", ACCOUNT);
    expect(recordAccountTermsConsent).toHaveBeenCalledWith(expect.anything(), "customer-1");
  });

  it("makes no account, and spends nothing of the link, when the Terms box was not ticked", async () => {
    const unticked = { name: ACCOUNT.name, password: ACCOUNT.password };
    await expect(redeemSetupInvite("token", unticked)).rejects.toBeInstanceOf(TermsNotAgreedError);
    expect(mockedCreateAccount).not.toHaveBeenCalled();
    expect(mockedRedeemInvite).not.toHaveBeenCalled();
    expect(recordAccountTermsConsent).not.toHaveBeenCalled();
  });

  it("does not ask for the tick when it links an account that already exists", async () => {
    const unticked = { name: ACCOUNT.name, password: ACCOUNT.password };
    signInEmail.mockResolvedValue({ user: { id: "existing-1" } });
    await redeemSetupInvite("token", { ...unticked, mode: "verify-existing" });
    expect(recordAccountTermsConsent).not.toHaveBeenCalled();
  });

  it("syncs a Payload tenant for the newly created business, after the business itself is redeemed", async () => {
    await redeemSetupInvite("token", ACCOUNT);

    expect(mockedSyncTenant).toHaveBeenCalledWith({ businessId: "business-1", name: INVITE.businessName });
    expect(mockedRedeemInvite.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSyncTenant.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not look up the invite when the redemption budget is spent", async () => {
    mockedConsumeRateLimit.mockResolvedValue(BLOCKED);

    await expect(redeemSetupInvite("token", ACCOUNT)).rejects.toBeInstanceOf(TooManySetupAttemptsError);
    expect(mockedFindRedeemableInvite).not.toHaveBeenCalled();
    expect(mockedCreateAccount).not.toHaveBeenCalled();
  });

  it("asks for existing-account verification before checking a proposed new password", async () => {
    mockedCreateAccount.mockRejectedValue(new AccountAlreadyExistsError(NORMALISED_EMAIL));
    await expect(redeemSetupInvite("token", ACCOUNT)).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect(signInEmail).not.toHaveBeenCalled();
    expect(mockedRedeemInvite).not.toHaveBeenCalled();
  });

  it("finishes an interrupted setup for the account an earlier attempt left behind", async () => {
    mockedCreateAccount.mockRejectedValue(new AccountAlreadyExistsError(NORMALISED_EMAIL));
    signInEmail.mockResolvedValue({ user: { id: "existing-1" } });

    await redeemSetupInvite("token", { ...ACCOUNT, mode: "verify-existing" });

    expect(mockedCreateAccount).not.toHaveBeenCalled();
    // The password is checked against the invite's own email, never one the submitter chose.
    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: NORMALISED_EMAIL, password: ACCOUNT.password },
      headers: requestHeaders,
    });
    expect(mockedRedeemInvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inviteId: INVITE.id, userId: "existing-1" }),
    );
  });

  it("spends the sign-in limits on the password it checks, and refuses a wrong one without redeeming", async () => {
    const alreadyExists = new AccountAlreadyExistsError(NORMALISED_EMAIL);
    mockedCreateAccount.mockRejectedValue(alreadyExists);
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    mockedIsInvalidCredentialsError.mockReturnValue(true);

    // The unchanged AccountAlreadyExistsError keeps the action's "You already have an account" message: a wrong
    // password here is answered exactly as it was before the recovery path existed.
    await expect(redeemSetupInvite("token", { ...ACCOUNT, mode: "verify-existing" })).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(RECOVERY_LIMIT_CHECKS);
    expect(mockedRedeemInvite).not.toHaveBeenCalled();
    expect(mockedSyncTenant).not.toHaveBeenCalled();
  });

  it("checks no password once a sign-in limit blocks the attempt", async () => {
    mockedCreateAccount.mockRejectedValue(new AccountAlreadyExistsError(NORMALISED_EMAIL));
    mockedConsumeRateLimit.mockResolvedValueOnce(ALLOWED).mockResolvedValue(BLOCKED);

    await expect(redeemSetupInvite("token", { ...ACCOUNT, mode: "verify-existing" })).rejects.toBeInstanceOf(TooManySetupAttemptsError);
    expect(signInEmail).not.toHaveBeenCalled();
    expect(mockedRedeemInvite).not.toHaveBeenCalled();
  });

  it("rethrows an auth fault that is not a credentials failure", async () => {
    const failure = new Error("upstream auth outage");
    mockedCreateAccount.mockRejectedValue(new AccountAlreadyExistsError(NORMALISED_EMAIL));
    signInEmail.mockRejectedValue(failure);

    await expect(redeemSetupInvite("token", { ...ACCOUNT, mode: "verify-existing" })).rejects.toThrow(failure);
  });
});

describe("findInviteForToken", () => {
  const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

  beforeEach(() => {
    vi.resetAllMocks();
    mockedHeaders.mockResolvedValue(requestHeaders);
    mockedGetStaffDb.mockReturnValue({} as unknown as Database);
    mockedConsumeRateLimit.mockResolvedValue(ALLOWED);
    mockedFindRedeemableInvite.mockResolvedValue(INVITE);
  });

  it("spends a lookup budget of its own before reading the token", async () => {
    expect(await findInviteForToken("token")).toBe(INVITE);
    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedConsumeRateLimit).toHaveBeenCalledWith(expect.anything(), "setup-view:client:203.0.113.7", {
      limit: 60,
      windowSeconds: 3600,
    });
  });

  it("preserves a temporary lookup limit instead of reporting a dead token", async () => {
    mockedConsumeRateLimit.mockResolvedValue(BLOCKED);

    expect(await findInviteForToken("token")).toEqual({ kind: "limited", retryAfterSeconds: BLOCKED.retryAfterSeconds });
    expect(mockedFindRedeemableInvite).not.toHaveBeenCalled();
  });
});
