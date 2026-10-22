import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { addBundledAddOnFor, removeBundledAddOnFor } from "@/lib/server/add-ons";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { startCustomerChargePayment } from "@/lib/server/charges";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import { addBundledAddOnAction, removeBundledAddOnAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/add-ons", () => ({ addBundledAddOnFor: vi.fn(), removeBundledAddOnFor: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("@/lib/server/charge-redirect", () => ({
  redirectForChargePayment: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const CUSTOMER = { tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" } };
const IDLE = { status: "idle" } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue(CUSTOMER as never);
});

describe("removeBundledAddOnAction", () => {
  it("removes the add-on for the signed-in customer, refreshes the page and says it saved", async () => {
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({
      kind: "scheduled",
      endsOn: new Date("2026-11-12T09:00:00.000Z"),
      message: "Social Media and Ads stays until your next payment date, then it stops.",
    });
    expect(await removeBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).toEqual({ status: "saved" });
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
    expect(removeBundledAddOnFor).toHaveBeenCalledWith(CUSTOMER, "digital-growth", expect.any(Date));
    expect(refresh).toHaveBeenCalled();
  });

  it("passes Local SEO + AEO through", async () => {
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "scheduled", endsOn: new Date("2026-11-12T09:00:00.000Z"), message: "ok" });
    await removeBundledAddOnAction(IDLE, form({ addOn: "local-seo-aeo" }));
    expect(removeBundledAddOnFor).toHaveBeenCalledWith(CUSTOMER, "local-seo-aeo", expect.any(Date));
  });

  it("hands back the server's reason on the form when refused, keeps the values, and still refreshes so the page is current", async () => {
    const message = "That add-on isn't part of your plan payment any more. Reload the page to see where it stands.";
    vi.mocked(removeBundledAddOnFor).mockResolvedValue({ kind: "refused", message });
    expect(await removeBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).toEqual({
      status: "error",
      message,
      field: null,
      values: { addOn: "digital-growth" },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("takes only a current add-on id from the form: a retired one, an unknown one and none at all are refused untouched", async () => {
    const badForms: ReadonlyArray<Record<string, string>> = [{ addOn: "social-media" }, { addOn: "toString" }, {}];
    for (const fields of badForms) {
      const state = await removeBundledAddOnAction(IDLE, form(fields));
      expect(state.status).toBe("error");
    }
    expect(removeBundledAddOnFor).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers with a plain message, logs without the message, and does not refresh when the work throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(removeBundledAddOnFor).mockRejectedValue(new Error("secret detail"));
    expect(await removeBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).toMatchObject({
      status: "error",
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret detail");
    expect(refresh).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("does nothing when the customer may not use the page", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValueOnce(new Error("NEXT_REDIRECT /login"));
    await expect(removeBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(removeBundledAddOnFor).not.toHaveBeenCalled();
  });
});

describe("addBundledAddOnAction", () => {
  it("opens the charge for the signed-in customer and sends them straight to pay it", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "pay", chargeId: "charge-1" });
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "redirect", url: "/billing/charges/confirm?token=t" });

    await expect(addBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(addBundledAddOnFor).toHaveBeenCalledWith(CUSTOMER, "digital-growth", expect.any(Date));
    expect(startCustomerChargePayment).toHaveBeenCalledWith(CUSTOMER, "charge-1");
    expect(redirectForChargePayment).toHaveBeenCalledWith({ kind: "redirect", url: "/billing/charges/confirm?token=t" });
  });

  it("redraws the page and says it saved when it is on with nothing to pay", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "done" });

    expect(await addBundledAddOnAction(IDLE, form({ addOn: "local-seo-aeo" }))).toEqual({ status: "saved" });
    expect(refresh).toHaveBeenCalled();
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });

  it("shows the refusal and redraws the page", async () => {
    vi.mocked(addBundledAddOnFor).mockResolvedValue({ kind: "refused", message: "We couldn't add that just now. Reload the page to see where it stands." });

    expect(await addBundledAddOnAction(IDLE, form({ addOn: "digital-growth" }))).toMatchObject({
      status: "error",
      message: "We couldn't add that just now. Reload the page to see where it stands.",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses an add-on id that is not in the catalogue, touching nothing", async () => {
    expect(await addBundledAddOnAction(IDLE, form({ addOn: "social-media" }))).toMatchObject({ status: "error" });
    expect(addBundledAddOnFor).not.toHaveBeenCalled();
  });
});
