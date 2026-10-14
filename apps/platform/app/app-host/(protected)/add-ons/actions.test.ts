import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { scheduleAddOnEndFor, startAddOnCheckoutFor, startPressReleaseFor } from "@/lib/server/add-ons";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import { buyPressReleaseAction, endAddOnAction, startAddOnAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/add-ons", () => ({
  startAddOnCheckoutFor: vi.fn(),
  startPressReleaseFor: vi.fn(),
  scheduleAddOnEndFor: vi.fn(),
}));

const CUSTOMER = { tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" } };
const ROW_ID = "0192f3c4-2222-7000-8000-000000000002";
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

describe("startAddOnAction", () => {
  it("lets a listing account buy, and opens the checkout for the add-on and intent in the form", async () => {
    vi.mocked(startAddOnCheckoutFor).mockResolvedValue({ kind: "redirect", url: "/add-ons/pay/abc" });
    await expect(startAddOnAction(IDLE, form({ addOn: "local-seo", intent: "buy" }))).rejects.toThrow("NEXT_REDIRECT /add-ons/pay/abc");
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
    expect(startAddOnCheckoutFor).toHaveBeenCalledWith(CUSTOMER, "local-seo", "buy", expect.any(Date));
  });

  it.each(["buy", "resume", "pay-now", "keep"] as const)("passes the %s intent through", async (intent) => {
    vi.mocked(startAddOnCheckoutFor).mockResolvedValue({ kind: "redirect", url: "/x" });
    await expect(startAddOnAction(IDLE, form({ addOn: "performance-marketing", intent }))).rejects.toThrow("NEXT_REDIRECT");
    expect(startAddOnCheckoutFor).toHaveBeenCalledWith(CUSTOMER, "performance-marketing", intent, expect.any(Date));
  });

  it("hands back the server's reason when the purchase is refused, and does not redirect", async () => {
    vi.mocked(startAddOnCheckoutFor).mockResolvedValue({ kind: "refused", message: "Local SEO is already running." });
    expect(await startAddOnAction(IDLE, form({ addOn: "local-seo", intent: "buy" }))).toEqual({
      status: "error",
      message: "Local SEO is already running.",
    });
  });

  it("takes only ids from the form: the press release, an unknown add-on and an unknown intent are refused untouched", async () => {
    const badForms: ReadonlyArray<Record<string, string>> = [
      { addOn: "press-release", intent: "buy" },
      { addOn: "toString", intent: "buy" },
      { addOn: "local-seo", intent: "free" },
      { addOn: "local-seo" },
      {},
    ];
    for (const fields of badForms) {
      const state = await startAddOnAction(IDLE, form(fields));
      expect(state.status).toBe("error");
    }
    expect(startAddOnCheckoutFor).not.toHaveBeenCalled();
  });

  it("answers with a plain message, and logs without the message, when opening the checkout throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(startAddOnCheckoutFor).mockRejectedValue(Object.assign(new Error("secret detail"), { code: "23505" }));
    expect(await startAddOnAction(IDLE, form({ addOn: "local-seo", intent: "buy" }))).toEqual({
      status: "error",
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret detail");
  });

  it("does nothing when the customer may not use the page", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValueOnce(new Error("NEXT_REDIRECT /login"));
    await expect(startAddOnAction(IDLE, form({ addOn: "local-seo", intent: "buy" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(startAddOnCheckoutFor).not.toHaveBeenCalled();
  });
});

describe("buyPressReleaseAction", () => {
  it("opens the payment for the signed-in customer and goes there", async () => {
    vi.mocked(startPressReleaseFor).mockResolvedValue({ kind: "redirect", url: "/billing/charges/pay/c1" });
    await expect(buyPressReleaseAction()).rejects.toThrow("NEXT_REDIRECT /billing/charges/pay/c1");
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
    expect(startPressReleaseFor).toHaveBeenCalledWith(CUSTOMER);
  });

  it("hands back the reason when it is refused", async () => {
    vi.mocked(startPressReleaseFor).mockResolvedValue({ kind: "refused", message: "That's a lot of attempts in a short time." });
    expect(await buyPressReleaseAction()).toEqual({ status: "error", message: "That's a lot of attempts in a short time." });
  });

  it("answers with a plain message when it throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(startPressReleaseFor).mockRejectedValue(new Error("boom"));
    expect(await buyPressReleaseAction()).toEqual({ status: "error", message: GENERIC_ERROR_MESSAGE });
  });
});

describe("endAddOnAction", () => {
  it("ends the add-on for the signed-in customer, refreshes the page and says it saved", async () => {
    vi.mocked(scheduleAddOnEndFor).mockResolvedValue({ kind: "done", message: "Local SEO will stop on 12 November 2026. You won't be charged again." });
    expect(await endAddOnAction(IDLE, form({ addOnSubscriptionId: ROW_ID, kind: "cancel" }))).toEqual({ status: "saved" });
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
    expect(scheduleAddOnEndFor).toHaveBeenCalledWith(CUSTOMER, ROW_ID, "cancel", expect.any(Date));
    expect(refresh).toHaveBeenCalled();
  });

  it("passes pause through", async () => {
    vi.mocked(scheduleAddOnEndFor).mockResolvedValue({ kind: "done", message: "ok" });
    await endAddOnAction(IDLE, form({ addOnSubscriptionId: ROW_ID, kind: "pause" }));
    expect(scheduleAddOnEndFor).toHaveBeenCalledWith(CUSTOMER, ROW_ID, "pause", expect.any(Date));
  });

  it("hands back the server's reason on the form when refused, keeps the values, and still refreshes so the page is current", async () => {
    vi.mocked(scheduleAddOnEndFor).mockResolvedValue({ kind: "refused", message: "Local SEO is already set to stop on 12 November 2026." });
    expect(await endAddOnAction(IDLE, form({ addOnSubscriptionId: ROW_ID, kind: "cancel" }))).toEqual({
      status: "error",
      message: "Local SEO is already set to stop on 12 November 2026.",
      field: null,
      values: { addOnSubscriptionId: ROW_ID, kind: "cancel" },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("takes only a uuid and a kind from the form, and calls nothing for anything else", async () => {
    const badForms: ReadonlyArray<Record<string, string>> = [
      { addOnSubscriptionId: "not-a-uuid", kind: "cancel" },
      { addOnSubscriptionId: ROW_ID, kind: "delete" },
      { addOnSubscriptionId: ROW_ID },
      { kind: "cancel" },
    ];
    for (const fields of badForms) {
      const state = await endAddOnAction(IDLE, form(fields));
      expect(state.status).toBe("error");
    }
    expect(scheduleAddOnEndFor).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers with a plain message and does not refresh when the work throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(scheduleAddOnEndFor).mockRejectedValue(new Error("connection reset"));
    expect(await endAddOnAction(IDLE, form({ addOnSubscriptionId: ROW_ID, kind: "cancel" }))).toMatchObject({
      status: "error",
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
