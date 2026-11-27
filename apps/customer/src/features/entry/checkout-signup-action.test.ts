import { bindPaymentLink, consumeRateLimit, setBusinessReferralCode } from "@brandbasket/db";
import { checkHuman, turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startSignupCheckoutAction } from "./actions";
import { CHECKOUT_ACCOUNT_EXISTS_MESSAGE } from "./rules/checkout-signup-messages";
import { lookUpPaymentLink } from "@/features/paylink/server/link";
import { createCheckoutAccount } from "./server/checkout-account";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@/features/start/rules", () => ({ startHref: () => "/start" }));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn(), turnstileSiteKey: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, consumeRateLimit: vi.fn(), bindPaymentLink: vi.fn(), setBusinessReferralCode: vi.fn() };
});
vi.mock("@/features/paylink/server/link", () => ({ lookUpPaymentLink: vi.fn() }));
vi.mock("./server/checkout-account", () => ({ createCheckoutAccount: vi.fn() }));
vi.mock("./server/env", () => ({ leadsApiToken: () => null }));
vi.mock("./server/listing-account", () => ({ requestJoinCode: vi.fn(), createListingAccount: vi.fn() }));
vi.mock("./server/account-recovery", () => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("./server/entry-access", () => ({ landingForSignedInUser: vi.fn() }));
vi.mock("./server/pending-signup-cookie", () => ({ setPendingSignupCookie: vi.fn(), clearPendingSignupCookie: vi.fn() }));
vi.mock("./server/sign-in", () => ({ signInWithPassword: vi.fn() }));
vi.mock("./server/customer-sign-in-form", () => ({ parseAccountIdentifier: vi.fn() }));

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of typeof value === "string" ? [value] : value) data.append(key, item);
  return data;
}
const VALID = {
  service: ["managed-website"],
  billing: "monthly",
  name: "Meera Shah",
  businessName: "Shah Sweets",
  email: "meera@example.test",
  phoneCountry: "IN",
  phone: "98200 11223",
  stateCode: "mh",
  agree: "yes",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9", "cf-ipcountry": "IN" }));
  vi.mocked(turnstileSiteKey).mockReturnValue("site-key");
  vi.mocked(checkHuman).mockResolvedValue({ ok: true });
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  vi.mocked(createCheckoutAccount).mockResolvedValue({ kind: "created", userId: "user-1", businessId: "business-1" });
});

describe("startSignupCheckoutAction", () => {
  it("creates the account for the visitor's own country and reports ok", async () => {
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toEqual({ ok: true });
    expect(createCheckoutAccount).toHaveBeenCalledWith(expect.objectContaining({ email: "meera@example.test", country: "IN", stateCode: "mh" }), null);
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^checkout-signup:ip:/), { limit: 5, windowSeconds: 3600 });
  });

  it("takes the country from the request and ignores one in the form", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "cf-ipcountry": "AE" }));
    await startSignupCheckoutAction(null, form({ ...VALID, country: "IN" }));
    expect(createCheckoutAccount).toHaveBeenCalledWith(expect.objectContaining({ country: "AE", stateCode: null }), null);
  });

  it("is refused by the human check before anything is read", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "Please confirm you are human." });
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toMatchObject({ ok: false, message: "Please confirm you are human." });
    expect(createCheckoutAccount).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("works while Turnstile has no keys, as the other entry forms do, on a real deployment too", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.brandbasket.in");
    vi.mocked(turnstileSiteKey).mockReturnValue(null);
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toEqual({ ok: true });
    expect(checkHuman).toHaveBeenCalledTimes(1);
  });

  it("creates nothing for a form that fails its checks, and says which field", async () => {
    await expect(startSignupCheckoutAction(null, form({ ...VALID, email: "nope" }))).resolves.toMatchObject({
      ok: false,
      field: "email",
      fieldErrors: { email: "Enter a valid email address." },
    });
    expect(createCheckoutAccount).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("is refused after the network's budget of five an hour", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1200 });
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toMatchObject({ ok: false });
    expect(createCheckoutAccount).not.toHaveBeenCalled();
  });

  it("answers an address that already has an account under Email, flagged for the two links", async () => {
    vi.mocked(createCheckoutAccount).mockResolvedValue({ kind: "exists" });
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toMatchObject({
      ok: false,
      field: "email",
      accountExists: true,
      message: CHECKOUT_ACCOUNT_EXISTS_MESSAGE,
    });
  });

  it("passes a refusal from the account step to its field", async () => {
    vi.mocked(createCheckoutAccount).mockResolvedValue({ kind: "refused", field: "phone", message: "Enter a valid phone number." });
    await expect(startSignupCheckoutAction(null, form(VALID))).resolves.toMatchObject({ ok: false, field: "phone" });
  });
});

describe("startSignupCheckoutAction with a staff payment link (plan 65)", () => {
  const TOKEN = "a".repeat(43);
  const link = (overrides: Record<string, unknown> = {}) =>
    ({ id: "link-1", businessId: null, countryCode: "IN", referralCodeId: null, ...overrides }) as unknown as Awaited<ReturnType<typeof lookUpPaymentLink>> extends infer L ? (L extends { link: infer P } ? P : never) : never;
  const open = (overrides: Record<string, unknown> = {}) => vi.mocked(lookUpPaymentLink).mockResolvedValue({ kind: "open", link: link(overrides) });

  beforeEach(() => {
    vi.mocked(bindPaymentLink).mockResolvedValue(true);
  });

  it("makes the account in the link's country whatever the visitor's, binds the link to the new business and reports ok", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "cf-ipcountry": "AE" }));
    open();

    await expect(startSignupCheckoutAction(null, form({ ...VALID, payLink: TOKEN }))).resolves.toEqual({ ok: true });

    expect(createCheckoutAccount).toHaveBeenCalledWith(expect.objectContaining({ country: "IN", stateCode: "mh" }), null);
    expect(bindPaymentLink).toHaveBeenCalledWith(expect.anything(), { linkId: "link-1", businessId: "business-1", now: expect.any(Date) });
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("puts the link's coupon on the new business, as typing the code would", async () => {
    open({ referralCodeId: "code-1" });

    await startSignupCheckoutAction(null, form({ ...VALID, payLink: TOKEN }));

    expect(setBusinessReferralCode).toHaveBeenCalledWith(expect.anything(), { businessId: "business-1", referralCodeId: "code-1" });
  });

  it("opens no account for a link that is cancelled, expired, paid or unknown", async () => {
    vi.mocked(lookUpPaymentLink).mockResolvedValue({ kind: "gone" });

    await expect(startSignupCheckoutAction(null, form({ ...VALID, payLink: TOKEN }))).resolves.toMatchObject({ ok: false, message: "This payment link no longer works. Ask us for a new one." });

    expect(createCheckoutAccount).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("opens no account for a link already bound to a business: its owner signs in to pay", async () => {
    open({ businessId: "business-9" });

    await expect(startSignupCheckoutAction(null, form({ ...VALID, payLink: TOKEN }))).resolves.toMatchObject({ ok: false });

    expect(createCheckoutAccount).not.toHaveBeenCalled();
  });

  it("refuses when the link was used between the check and the binding", async () => {
    open();
    vi.mocked(bindPaymentLink).mockResolvedValue(false);

    await expect(startSignupCheckoutAction(null, form({ ...VALID, payLink: TOKEN }))).resolves.toMatchObject({ ok: false, message: "This payment link no longer works. Ask us for a new one." });
  });

  it("changes nothing for the public checkout, which posts no link", async () => {
    await startSignupCheckoutAction(null, form(VALID));

    expect(lookUpPaymentLink).not.toHaveBeenCalled();
    expect(bindPaymentLink).not.toHaveBeenCalled();
  });
});
