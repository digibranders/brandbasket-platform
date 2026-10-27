import { acceptChangeQuote, ChangeRequestError } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openQuoteCharge } from "./change-quote";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ kind: "staff-db" })) }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), acceptChangeQuote: vi.fn() }));

const NOW = new Date("2026-11-28T05:00:00.000Z");
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(acceptChangeQuote).mockResolvedValue({ chargeId: "charge-1", opened: true });
});

describe("openQuoteCharge", () => {
  it("opens the charge for the session's business at the plan's GST rate, on the staff connection", async () => {
    const result = await openQuoteCharge({ tenant, billing: { plan: { taxRateBasisPoints: 1800 } } as never }, "request-1", NOW);
    expect(result).toEqual({ chargeId: "charge-1" });
    expect(acceptChangeQuote).toHaveBeenCalledWith({ kind: "staff-db" }, { requestId: "request-1", businessId: "business-1", taxRateBasisPoints: 1800, now: NOW });
  });

  it("refuses when there is no plan to take the GST rate from, and opens nothing", async () => {
    await expect(openQuoteCharge({ tenant, billing: { plan: null } as never }, "request-1", NOW)).rejects.toThrow(ChangeRequestError);
    expect(acceptChangeQuote).not.toHaveBeenCalled();
  });

  it("lets a refusal from the database through", async () => {
    vi.mocked(acceptChangeQuote).mockRejectedValue(new ChangeRequestError("wrong_state", "There is no quote to accept."));
    await expect(openQuoteCharge({ tenant, billing: { plan: { taxRateBasisPoints: 0 } } as never }, "request-1", NOW)).rejects.toMatchObject({ code: "wrong_state" });
  });
});
