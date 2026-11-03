import { notFound, redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomer } from "@/lib/guards";
import { applyCodeAction, lookupPincodeAction, payChargeAction, removeCodeAction, saveBillingDetailsAction, startPaymentAction } from "./actions";
import { lookupBillingPincode, saveBillingDetailsFor } from "./server/billing-details";
import { startCustomerChargePayment } from "./server/charges";
import { startCheckoutFor, startMembershipCheckoutFor } from "./server/checkout";
import { loadBusinessEntry } from "./server/entry";
import { applyReferralCodeFor, removeReferralCodeFor } from "./server/referrals";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
vi.mock("@/lib/guards", () => ({ requireCustomer: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./server/billing-details", () => ({ saveBillingDetailsFor: vi.fn(), lookupBillingPincode: vi.fn() }));
vi.mock("./server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("./server/checkout", () => ({ startCheckoutFor: vi.fn(), startMembershipCheckoutFor: vi.fn() }));
vi.mock("./server/entry", () => ({ loadBusinessEntry: vi.fn() }));
vi.mock("./server/referrals", () => ({ applyReferralCodeFor: vi.fn(), removeReferralCodeFor: vi.fn() }));

const CUSTOMER = { user: { id: "user-1" }, tenant: { businessId: "biz-1" }, billing: { status: "unpaid" } } as never;
const CHARGE_ID = "0192f3c4-0000-7000-8000-000000000001";

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const each of typeof value === "string" ? [value] : value) data.append(key, each);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomer).mockResolvedValue(CUSTOMER);
  vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
});

describe("every checkout action runs the guard first", () => {
  it("reads and writes nothing when the guard turns the person away", async () => {
    vi.mocked(requireCustomer).mockRejectedValue(new Error("redirect:/login"));
    await expect(startPaymentAction(null, form({ tier: "managed" }))).rejects.toThrow("redirect:/login");
    await expect(applyCodeAction(null, form({ referralCode: "FRIEND10" }))).rejects.toThrow("redirect:/login");
    await expect(removeCodeAction()).rejects.toThrow("redirect:/login");
    await expect(saveBillingDetailsAction(null, form({}))).rejects.toThrow("redirect:/login");
    await expect(lookupPincodeAction("400028")).rejects.toThrow("redirect:/login");
    await expect(payChargeAction(null, form({ chargeId: CHARGE_ID }))).rejects.toThrow("redirect:/login");
    expect(startMembershipCheckoutFor).not.toHaveBeenCalled();
    expect(applyReferralCodeFor).not.toHaveBeenCalled();
    expect(saveBillingDetailsFor).not.toHaveBeenCalled();
    expect(lookupBillingPincode).not.toHaveBeenCalled();
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });
});

describe("startPaymentAction", () => {
  it("refuses a form that names another plan, before anything is opened", async () => {
    const result = await startPaymentAction(null, form({ tier: "premium", service: "managed-website" }));
    expect(result.ok).toBe(false);
    expect(startMembershipCheckoutFor).not.toHaveBeenCalled();
  });

  it("opens a sign-up account's checkout on the catalogue services named, dropping anything else", async () => {
    vi.mocked(startMembershipCheckoutFor).mockResolvedValue({ kind: "redirect", url: "/checkout/pay" });
    await expect(startPaymentAction(null, form({ tier: "managed", service: ["digital-growth", "nonsense", "managed-website"] }))).rejects.toThrow("redirect:/checkout/pay");
    expect(startMembershipCheckoutFor).toHaveBeenCalledWith(CUSTOMER, expect.any(Date), "managed", ["managed-website", "digital-growth"]);
    expect(startCheckoutFor).not.toHaveBeenCalled();
  });

  it("opens a website client's checkout for the website alone, whatever the form says", async () => {
    vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
    vi.mocked(startCheckoutFor).mockResolvedValue({ kind: "redirect", url: "/checkout/pay" });
    await expect(startPaymentAction(null, form({ tier: "managed", service: "local-seo-aeo" }))).rejects.toThrow("redirect:/checkout/pay");
    expect(startCheckoutFor).toHaveBeenCalledWith(CUSTOMER, expect.any(Date));
    expect(startMembershipCheckoutFor).not.toHaveBeenCalled();
  });

  it("saves billing details first when the form carries them, and stops on a refused field", async () => {
    vi.mocked(saveBillingDetailsFor).mockResolvedValue({ ok: false, message: "Choose your state.", fieldErrors: { stateCode: "Choose your state." } });
    const result = await startPaymentAction(null, form({ tier: "managed", addressLine1: "Shop 4" }));
    expect(result).toEqual({ ok: false, message: "Choose your state.", fieldErrors: { stateCode: "Choose your state." } });
    expect(startMembershipCheckoutFor).not.toHaveBeenCalled();
  });

  it("returns the checkout's refusal as the message", async () => {
    vi.mocked(startMembershipCheckoutFor).mockResolvedValue({ kind: "refused", problem: { message: "Add your billing details to pay.", field: null } });
    expect(await startPaymentAction(null, form({ tier: "managed" }))).toEqual({ ok: false, message: "Add your billing details to pay." });
  });

  it("says something went wrong, without losing the form, when saving the details fails", async () => {
    vi.mocked(saveBillingDetailsFor).mockRejectedValue(new Error("db down"));
    const result = await startPaymentAction(null, form({ tier: "managed", addressLine1: "Shop 4" }));
    expect(result.ok).toBe(false);
    expect(startMembershipCheckoutFor).not.toHaveBeenCalled();
  });
});

describe("codes", () => {
  it("prices a sign-up account's code against its basket", async () => {
    vi.mocked(applyReferralCodeFor).mockResolvedValue({ kind: "applied", discount: {} as never });
    expect(await applyCodeAction(null, form({ referralCode: "FRIEND10", service: ["managed-website", "digital-growth"] }))).toEqual({ ok: true });
    expect(applyReferralCodeFor).toHaveBeenCalledWith(CUSTOMER, "FRIEND10", ["managed-website", "digital-growth"], expect.any(Date));
  });

  it("prices a website client's code against the website alone", async () => {
    vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
    vi.mocked(applyReferralCodeFor).mockResolvedValue({ kind: "applied", discount: {} as never });
    await applyCodeAction(null, form({ referralCode: "FRIEND10", service: "local-seo-aeo" }));
    expect(applyReferralCodeFor).toHaveBeenCalledWith(CUSTOMER, "FRIEND10", ["managed-website"], expect.any(Date));
  });

  it("puts a refusal under the code field", async () => {
    vi.mocked(applyReferralCodeFor).mockResolvedValue({ kind: "refused", problem: { message: "That code isn’t valid.", field: "referralCode" } });
    expect(await applyCodeAction(null, form({ referralCode: "NOPE" }))).toEqual({ ok: false, message: "That code isn’t valid.", fieldErrors: { referralCode: "That code isn’t valid." } });
  });

  it("refuses an overlong code without asking the server", async () => {
    const result = await applyCodeAction(null, form({ referralCode: "X".repeat(65) }));
    expect(result.ok).toBe(false);
    expect(applyReferralCodeFor).not.toHaveBeenCalled();
  });

  it("removes a code, or says why not", async () => {
    vi.mocked(removeReferralCodeFor).mockResolvedValueOnce({ kind: "removed" });
    expect(await removeCodeAction()).toEqual({ ok: true });
    vi.mocked(removeReferralCodeFor).mockResolvedValueOnce({ kind: "refused", problem: { message: "Your payment is already made.", field: null } });
    expect(await removeCodeAction()).toEqual({ ok: false, message: "Your payment is already made." });
  });
});

describe("lookupPincodeAction", () => {
  it("looks up a string and treats anything else as not found", async () => {
    vi.mocked(lookupBillingPincode).mockResolvedValue({ kind: "no-directory" });
    expect(await lookupPincodeAction("400028")).toEqual({ ok: true, data: { kind: "no-directory" } });
    expect(await lookupPincodeAction({ evil: true })).toEqual({ ok: true, data: { kind: "not-found" } });
    expect(lookupBillingPincode).toHaveBeenCalledTimes(1);
  });
});

describe("payChargeAction", () => {
  it("finds nothing for an id that is not a charge id", async () => {
    await expect(payChargeAction(null, form({ chargeId: "../../billing" }))).rejects.toThrow("not-found");
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });

  it("opens Razorpay on the charge's own pay page, or says it is already settled", async () => {
    vi.mocked(startCustomerChargePayment).mockResolvedValueOnce({ kind: "razorpay", orderId: "order_1", charge: { id: CHARGE_ID } as never });
    await expect(payChargeAction(null, form({ chargeId: CHARGE_ID }))).rejects.toThrow(`redirect:/checkout/charges/${CHARGE_ID}`);
    vi.mocked(startCustomerChargePayment).mockResolvedValueOnce({ kind: "not-open" });
    await expect(payChargeAction(null, form({ chargeId: CHARGE_ID }))).rejects.toThrow("redirect:/billing?charge=not-open");
    expect(vi.mocked(redirect)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(notFound)).not.toHaveBeenCalled();
  });
});
