import { ChangeRequestError } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { openQuoteCharge } from "@/lib/server/change-quote";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { startCustomerChargePayment } from "@/lib/server/charges";
import { acceptQuoteAction } from "./pay-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/billing", () => ({ requireBillingAccess: vi.fn() }));
vi.mock("@/lib/server/change-quote", () => ({ openQuoteCharge: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("@/lib/server/charge-redirect", () => ({ redirectForChargePayment: vi.fn() }));

const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };
const REQUEST = "0192f3c4-0000-7000-8000-000000000001";
const TICKET = "0192f3c4-0000-7000-8000-000000000002";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const move = (action: (formData: FormData) => Promise<void>, fields: Record<string, string> = { requestId: REQUEST, ticketId: TICKET }) => action(form(fields));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true, plan: { taxRateBasisPoints: 1800 } } } as never);
  vi.mocked(openQuoteCharge).mockResolvedValue({ chargeId: "charge-1" });
  vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "redirect", url: "https://pay.example/charge-1" });
});

describe("acceptQuoteAction", () => {
  it("opens the charge for the signed-in customer's business and sends them to pay it", async () => {
    await move(acceptQuoteAction);
    expect(openQuoteCharge).toHaveBeenCalledWith(expect.objectContaining({ tenant }), REQUEST, expect.any(Date));
    expect(startCustomerChargePayment).toHaveBeenCalledWith(expect.objectContaining({ tenant }), "charge-1");
    expect(redirectForChargePayment).toHaveBeenCalledWith({ kind: "redirect", url: "https://pay.example/charge-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/requests");
  });

  it("needs a paid plan, and opens nothing without one", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("billing required"));
    await expect(move(acceptQuoteAction)).rejects.toThrow("billing required");
    expect(openQuoteCharge).not.toHaveBeenCalled();
  });

  it("is a not-found for an id that is not an id", async () => {
    await expect(move(acceptQuoteAction, { requestId: "x", ticketId: TICKET })).rejects.toThrow("notFound");
    expect(openQuoteCharge).not.toHaveBeenCalled();
  });

  it("goes back to the request with a word when the quote has changed or something failed, and starts no payment", async () => {
    vi.mocked(openQuoteCharge).mockRejectedValue(new ChangeRequestError("wrong_state", "There is no quote to accept."));
    await expect(move(acceptQuoteAction)).rejects.toThrow(`redirect:/requests?open=${TICKET}&notice=changed`);
    vi.mocked(openQuoteCharge).mockRejectedValue(new Error("db down"));
    await expect(move(acceptQuoteAction)).rejects.toThrow("&notice=failed");
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });
});
