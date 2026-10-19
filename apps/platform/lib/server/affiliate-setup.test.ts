import { headers } from "next/headers";
import { AccountAlreadyExistsError, createAccountWithGrant } from "@brandbasket/auth";
import { claimAffiliateLoginLink, findAffiliateLoginInvite, resetAffiliateCredentialPassword, type AffiliateLoginInvite, type Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateAccountTakenError, findAffiliateInviteForToken, redeemAffiliateLogin } from "./affiliate-setup";
import { recordAccountTermsConsent } from "./account-consent";
import { getStaffDb } from "./db";
import { signInCustomer } from "./customer-sign-in";
import { assertWithinSetupRateLimit, TermsNotAgreedError, verifyExistingAccount, withinSetupViewBudget } from "./setup";

// The database, Better Auth, the incoming request and the client setup's shared guards are test doubles, so the module's
// own decisions (which path a link takes, and what it must close) run in isolation. The auth package is mocked with a
// real AccountAlreadyExistsError class because the recovery path turns on `instanceof`.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@brandbasket/auth", () => ({
  AccountAlreadyExistsError: class AccountAlreadyExistsError extends Error {
    constructor(email: string) {
      super(`An account for ${email} already exists.`);
      this.name = "AccountAlreadyExistsError";
    }
  },
  createAccountWithGrant: vi.fn(),
}));
vi.mock("@brandbasket/db", () => ({ claimAffiliateLoginLink: vi.fn(), findAffiliateLoginInvite: vi.fn(), resetAffiliateCredentialPassword: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn(() => ({ $context: Promise.resolve({ password: { hash: vi.fn(async (password: string) => `hashed:${password}`) } }) })) }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./customer-sign-in", () => ({ signInCustomer: vi.fn() }));
vi.mock("./account-consent", () => ({ recordAccountTermsConsent: vi.fn() }));
vi.mock("./setup", () => ({
  InviteNotUsableError: class InviteNotUsableError extends Error {},
  TermsNotAgreedError: class TermsNotAgreedError extends Error {},
  assertWithinSetupRateLimit: vi.fn(),
  normaliseEmail: (email: string) => email.trim().toLowerCase(),
  verifyExistingAccount: vi.fn(),
  withinSetupViewBudget: vi.fn(),
}));

const TOKEN = "link-token";
const ACCOUNT = { name: "Asha Nair", password: "a-long-password-9", agreed: true as const };
const INVITE: AffiliateLoginInvite = { affiliateId: "aff-1", name: "Asha Nair", email: "Asha@Example.com", userId: null };
const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
const transactionDb = {} as Database;
const staffDb = { transaction: vi.fn() } as unknown as Database;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(headers).mockResolvedValue(requestHeaders);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(staffDb.transaction).mockImplementation(async (callback) => callback(transactionDb as never));
  vi.mocked(findAffiliateLoginInvite).mockResolvedValue(INVITE);
  vi.mocked(claimAffiliateLoginLink).mockResolvedValue("claimed");
  vi.mocked(createAccountWithGrant).mockResolvedValue({ userId: "user-1", email: "asha@example.com" });
  vi.mocked(withinSetupViewBudget).mockResolvedValue({ allowed: true });
});

describe("findAffiliateInviteForToken", () => {
  it("reads the link while the network has lookups left", async () => {
    expect(await findAffiliateInviteForToken(TOKEN)).toEqual(INVITE);
    expect(findAffiliateLoginInvite).toHaveBeenCalledWith(staffDb, TOKEN);
  });

  it("reads as no link once the network has spent its lookups", async () => {
    vi.mocked(withinSetupViewBudget).mockResolvedValue({ allowed: false, retryAfterSeconds: 137 });
    expect(await findAffiliateInviteForToken(TOKEN)).toEqual({ kind: "limited", retryAfterSeconds: 137 });
    expect(findAffiliateLoginInvite).not.toHaveBeenCalled();
  });
});

describe("redeemAffiliateLogin", () => {
  it("makes the account with the address the link names, closes the link, and signs them in", async () => {
    expect(await redeemAffiliateLogin(TOKEN, ACCOUNT)).toEqual({ signedIn: true });

    expect(assertWithinSetupRateLimit).toHaveBeenCalledWith("203.0.113.7");
    expect(createAccountWithGrant).toHaveBeenCalledWith(expect.anything(), staffDb, {
      email: "asha@example.com",
      name: "Asha Nair",
      password: ACCOUNT.password,
    });
    expect(claimAffiliateLoginLink).toHaveBeenCalledWith(transactionDb, { token: TOKEN, now: expect.any(Date), userId: "user-1" });
    expect(signInCustomer).toHaveBeenCalledWith({ email: "asha@example.com", password: ACCOUNT.password }, requestHeaders);
  });

  it("keeps proof that the new affiliate agreed to the Terms and Privacy Notice, against the account just made", async () => {
    await redeemAffiliateLogin(TOKEN, ACCOUNT);
    expect(recordAccountTermsConsent).toHaveBeenCalledWith(staffDb, "user-1");
  });

  it("makes no account when the Terms box was not ticked", async () => {
    const unticked = { name: ACCOUNT.name, password: ACCOUNT.password };
    await expect(redeemAffiliateLogin(TOKEN, unticked)).rejects.toBeInstanceOf(TermsNotAgreedError);
    expect(createAccountWithGrant).not.toHaveBeenCalled();
    expect(recordAccountTermsConsent).not.toHaveBeenCalled();
  });

  it("refuses a link that is dead, before touching any account", async () => {
    vi.mocked(findAffiliateLoginInvite).mockResolvedValue(null);
    await expect(redeemAffiliateLogin(TOKEN, ACCOUNT)).rejects.toThrow();
    expect(createAccountWithGrant).not.toHaveBeenCalled();
    expect(resetAffiliateCredentialPassword).not.toHaveBeenCalled();
  });

  it("gives an affiliate who already signs in a new password instead of a second account, and sends them to sign in", async () => {
    vi.mocked(findAffiliateLoginInvite).mockResolvedValue({ ...INVITE, userId: "user-9" });

    // Choosing a new password for an account that exists needs no tick and records no consent.
    const unticked = { name: ACCOUNT.name, password: ACCOUNT.password };
    expect(await redeemAffiliateLogin(TOKEN, unticked)).toEqual({ signedIn: false });
    expect(recordAccountTermsConsent).not.toHaveBeenCalled();

    expect(resetAffiliateCredentialPassword).toHaveBeenCalledWith(transactionDb, "user-9", `hashed:${ACCOUNT.password}`);
    expect(createAccountWithGrant).not.toHaveBeenCalled();
    expect(claimAffiliateLoginLink).toHaveBeenCalledWith(transactionDb, { token: TOKEN, now: expect.any(Date), userId: "user-9" });
    expect(signInCustomer).not.toHaveBeenCalled();
  });

  it("links an account the address already has when its password is proved, without signing in twice", async () => {
    vi.mocked(createAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError("asha@example.com"));
    vi.mocked(verifyExistingAccount).mockResolvedValue("user-5");

    expect(await redeemAffiliateLogin(TOKEN, { ...ACCOUNT, mode: "verify-existing" })).toEqual({ signedIn: true });

    expect(verifyExistingAccount).toHaveBeenCalledWith("asha@example.com", ACCOUNT.password, "203.0.113.7", requestHeaders);
    expect(claimAffiliateLoginLink).toHaveBeenCalledWith(transactionDb, { token: TOKEN, now: expect.any(Date), userId: "user-5" });
    expect(signInCustomer).not.toHaveBeenCalled();
  });

  it("links nothing when the password for the existing account is wrong", async () => {
    vi.mocked(createAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError("asha@example.com"));
    vi.mocked(verifyExistingAccount).mockResolvedValue(null);

    await expect(redeemAffiliateLogin(TOKEN, { ...ACCOUNT, mode: "verify-existing" })).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect(claimAffiliateLoginLink).not.toHaveBeenCalled();
  });

  it("serializes concurrent resets before mutating credentials", async () => {
    let held = false;
    let consumed = false;
    let release: () => void = () => {};
    const unlocked = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(staffDb.transaction).mockImplementation(async (callback) => {
      if (held) await unlocked;
      held = true;
      try { return await callback(transactionDb as never); }
      finally { release(); }
    });
    vi.mocked(findAffiliateLoginInvite).mockImplementation(async () => consumed ? null : { ...INVITE, userId: "user-9" });
    vi.mocked(claimAffiliateLoginLink).mockImplementation(async () => {
      if (consumed) return "closed";
      consumed = true;
      return "claimed";
    });
    const results = await Promise.allSettled([
      redeemAffiliateLogin(TOKEN, ACCOUNT),
      redeemAffiliateLogin(TOKEN, { ...ACCOUNT, password: "different-long-password-9" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(resetAffiliateCredentialPassword).toHaveBeenCalledTimes(1);
  });

  it("restores the token reservation after a failed reset", async () => {
    let consumed = false;
    vi.mocked(findAffiliateLoginInvite).mockImplementation(async () => consumed ? null : { ...INVITE, userId: "user-9" });
    vi.mocked(claimAffiliateLoginLink).mockImplementation(async () => { consumed = true; return "claimed"; });
    vi.mocked(staffDb.transaction).mockImplementation(async (callback) => {
      const before = consumed;
      try { return await callback(transactionDb as never); }
      catch (error) { consumed = before; throw error; }
    });
    vi.mocked(resetAffiliateCredentialPassword).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(redeemAffiliateLogin(TOKEN, ACCOUNT)).rejects.toThrow("database unavailable");
    expect(consumed).toBe(false);
    expect(await redeemAffiliateLogin(TOKEN, ACCOUNT)).toEqual({ signedIn: false });
    expect(consumed).toBe(true);
  });

  it("asks for current-password verification after a duplicate account, without guessing it", async () => {
    vi.mocked(createAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError("asha@example.com"));
    await expect(redeemAffiliateLogin(TOKEN, ACCOUNT)).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    expect(verifyExistingAccount).not.toHaveBeenCalled();
    expect(claimAffiliateLoginLink).not.toHaveBeenCalled();
  });

  it("rejects existing-account mode on a reset link without changing credentials", async () => {
    vi.mocked(findAffiliateLoginInvite).mockResolvedValue({ ...INVITE, userId: "user-9" });
    await expect(redeemAffiliateLogin(TOKEN, { ...ACCOUNT, mode: "verify-existing" })).rejects.toThrow();
    expect(resetAffiliateCredentialPassword).not.toHaveBeenCalled();
    expect(verifyExistingAccount).not.toHaveBeenCalled();
  });

  it("does not sign in when the link was closed by another submission first", async () => {
    vi.mocked(claimAffiliateLoginLink).mockResolvedValue("closed");
    await expect(redeemAffiliateLogin(TOKEN, ACCOUNT)).rejects.toThrow();
    expect(signInCustomer).not.toHaveBeenCalled();
  });

  it("refuses an account that already belongs to a different affiliate", async () => {
    vi.mocked(claimAffiliateLoginLink).mockResolvedValue("user-taken");
    await expect(redeemAffiliateLogin(TOKEN, ACCOUNT)).rejects.toBeInstanceOf(AffiliateAccountTakenError);
    expect(signInCustomer).not.toHaveBeenCalled();
  });
});
