import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOwner } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { saveBillingDetailsFor } from "../checkout/server/billing-details";
import { startCustomerChargePayment } from "../checkout/server/charges";
import { startReactivationFor } from "../checkout/server/checkout";
import { addServiceAction, cancelServiceAction, changePaymentMethodAction, reactivateAction, saveBillingDetailsAction } from "./actions";
import { addBundledAddOnFor, removeBundledAddOnFor } from "./server/add-ons";
import { getPaymentMethodUpdateUrlFor } from "./server/billing";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/guards", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("../checkout/server/billing-details", () => ({ saveBillingDetailsFor: vi.fn() }));
vi.mock("../checkout/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("../checkout/server/checkout", () => ({ startReactivationFor: vi.fn() }));
vi.mock("./server/add-ons", () => ({ addBundledAddOnFor: vi.fn(), removeBundledAddOnFor: vi.fn() }));
vi.mock("./server/billing", () => ({ getPaymentMethodUpdateUrlFor: vi.fn() }));

const OWNER = { user: { id: "user-1" }, tenant: { businessId: "biz-1" }, role: "owner", billing: { status: "paid" } } as never;
const CHARGE_ID = "0192f3c4-0000-7000-8000-000000000001";

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const each of typeof value === "string" ? [value] : value) data.append(key, each);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER);
});

describe("guards", () => {
  it("asks for the owner with a live plan to add or cancel, and the owner alone to reactivate or save details", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "done" });
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "scheduled", endsOn: new Date(), message: "ok" });
    vi.mocked(saveBillingDetailsFor).mockResolvedValue({ ok: true });
    vi.mocked(startReactivationFor).mockResolvedValue({ kind: "refused", problem: { message: "no" } } as never);
    await addServiceAction(null, form({ addOn: "social-media" }));
    await cancelServiceAction(null, form({ addOn: "social-media" }));
    expect(vi.mocked(requireOwner).mock.calls).toEqual([[{ write: true }], [{ write: true }]]);
    await reactivateAction(null, form({}));
    await saveBillingDetailsAction(null, form({}));
    expect(vi.mocked(requireOwner).mock.calls.slice(2)).toEqual([[], []]);
  });

  it("changes nothing when the guard sends an editor, a viewer or a lapsed plan away", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("redirect:/"));
    await expect(addServiceAction(null, form({ addOn: "social-media" }))).rejects.toThrow("redirect:/");
    await expect(cancelServiceAction(null, form({ addOn: "social-media" }))).rejects.toThrow("redirect:/");
    await expect(reactivateAction(null, form({}))).rejects.toThrow("redirect:/");
    await expect(saveBillingDetailsAction(null, form({}))).rejects.toThrow("redirect:/");
    expect(addBundledAddOnFor).not.toHaveBeenCalled();
    expect(removeBundledAddOnFor).not.toHaveBeenCalled();
    expect(startReactivationFor).not.toHaveBeenCalled();
    expect(saveBillingDetailsFor).not.toHaveBeenCalled();
  });
});

describe("addServiceAction", () => {
  it("refuses a service that is not in the catalogue, reading nothing else from the form", async () => {
    const result = await addServiceAction(null, form({ addOn: "premium", price: "1" }));
    expect(result.ok).toBe(false);
    expect(addBundledAddOnFor).not.toHaveBeenCalled();
  });

  it("sends the customer to pay the charge for the rest of the month", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "pay", chargeId: CHARGE_ID });
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "razorpay", charge: { id: CHARGE_ID } } as never);
    await expect(addServiceAction(null, form({ addOn: "paid-ads" }))).rejects.toThrow(`redirect:/checkout/charges/${CHARGE_ID}`);
    expect(addBundledAddOnFor).toHaveBeenCalledWith(OWNER, "paid-ads", expect.any(Date));
  });

  it("sends the customer to approve a combined subscription", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "approve", url: "/billing/services/pay" });
    await expect(addServiceAction(null, form({ addOn: "paid-ads" }))).rejects.toThrow("redirect:/billing/services/pay");
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });

  it("returns the refusal, and a plain message when something breaks", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "refused", message: "Your payment is due within the hour." });
    expect(await addServiceAction(null, form({ addOn: "social-media" }))).toEqual({ ok: false, message: "Your payment is due within the hour." });
    vi.mocked(addBundledAddOnFor).mockRejectedValue(new Error("db down"));
    expect((await addServiceAction(null, form({ addOn: "social-media" }))).ok).toBe(false);
    expect(reportError).toHaveBeenCalled();
  });
});

describe("cancelServiceAction", () => {
  it("passes the service and the trimmed reason, and says when it stops", async () => {
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "scheduled", endsOn: new Date(), message: "Social & Ads stays until your next payment date, then it stops." });
    const result = await cancelServiceAction(null, form({ addOn: "social-media", reason: "  Too busy to post. " }));
    expect(removeBundledAddOnFor).toHaveBeenCalledWith(OWNER, "social-media", expect.any(Date), "Too busy to post.");
    expect(result).toEqual({ ok: true, data: { message: "Social & Ads stays until your next payment date, then it stops." } });
  });

  it("sends no reason when none is given, and refuses one over 500 characters", async () => {
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "scheduled", endsOn: new Date(), message: "ok" });
    await cancelServiceAction(null, form({ addOn: "social-media", reason: "" }));
    expect(removeBundledAddOnFor).toHaveBeenLastCalledWith(OWNER, "social-media", expect.any(Date), null);
    const long = await cancelServiceAction(null, form({ addOn: "social-media", reason: "a".repeat(501) }));
    expect(long).toMatchObject({ ok: false, fieldErrors: { reason: "Keep the reason to 500 characters or fewer." } });
    expect(removeBundledAddOnFor).toHaveBeenCalledTimes(1);
  });

  it("returns the refusal for the only service", async () => {
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "refused", message: "That is your only service, so it can't be removed on its own. To stop paying, delete your account from Settings." });
    expect(await cancelServiceAction(null, form({ addOn: "managed-website" }))).toMatchObject({ ok: false });
  });
});

describe("reactivateAction", () => {
  it("passes only catalogue services and goes to pay", async () => {
    vi.mocked(startReactivationFor).mockResolvedValue({ kind: "redirect", url: "/checkout/pay" } as never);
    await expect(reactivateAction(null, form({ service: ["social-media", "free-money"] }))).rejects.toThrow("redirect:/checkout/pay");
    expect(startReactivationFor).toHaveBeenCalledWith(OWNER, expect.any(Date), ["social-media"]);
  });
});

describe("changePaymentMethodAction", () => {
  it("requires owner and redirects to the update URL from provider", async () => {
    vi.mocked(getPaymentMethodUpdateUrlFor).mockResolvedValue("https://rzp.io/i/sub_test_update");
    await expect(changePaymentMethodAction()).rejects.toThrow("redirect:https://rzp.io/i/sub_test_update");
    expect(requireOwner).toHaveBeenCalled();
    expect(getPaymentMethodUpdateUrlFor).toHaveBeenCalledWith(OWNER);
  });

  it("returns failure when provider throws", async () => {
    vi.mocked(getPaymentMethodUpdateUrlFor).mockRejectedValue(new Error("provider unavailable"));
    const result = await changePaymentMethodAction();
    expect(result.ok).toBe(false);
    expect(reportError).toHaveBeenCalled();
  });
});
