import type { Charge } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findBillingState: vi.fn(),
    findChargeForBusiness: vi.fn(),
    insertCharge: vi.fn(async (_db: unknown, input: object) => ({ id: "charge-1", ...input })),
    lockBusinessForBilling: vi.fn(),
    waiveCharge: vi.fn(),
  };
});
vi.mock("@brandbasket/shared/server/charge-payments", () => ({ recordChargePaymentWithInvoice: vi.fn() }));
vi.mock("@brandbasket/shared/server/basket-change", () => ({ finishAddOnAfterPayment: vi.fn() }));
vi.mock("./basket-deps", () => ({ basketDeps: () => ({ name: "basket-deps" }) }));
vi.mock("./db", () => ({
  getStaffDb: () => ({ name: "staff-db", transaction: (fn: (tx: unknown) => unknown) => fn({ name: "staff-tx" }) }),
}));

import { findBillingState, findChargeForBusiness, insertCharge, lockBusinessForBilling } from "@brandbasket/db";
import { finishAddOnAfterPayment } from "@brandbasket/shared/server/basket-change";
import { recordChargePaymentWithInvoice } from "@brandbasket/shared/server/charge-payments";
import { addClientCharge, markClientChargePaid } from "./charges-admin";

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-10-02T09:00:00Z");
const INR_PLAN = {
  currency: "INR",
  taxRateBasisPoints: 1800,
  extraHourAmountCents: 142_500,
  extraPublishAmountCents: 95_000,
  extraBlogPostsAmountCents: 47_500,
  blogPostBlockSize: 100,
};

const OPEN_CHARGE = { id: "charge-1", status: "open", amountCents: 285_000, currency: "INR" } as Charge;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findBillingState).mockResolvedValue({ plan: INR_PLAN } as never);
});

describe("addClientCharge", () => {
  it("prices a charge from the client's plan, in its currency, with its GST included", async () => {
    const outcome = await addClientCharge({
      businessId: BUSINESS,
      staffUserId: "staff-1",
      request: { kind: "change_hours", quantity: 2, description: null, customUnitAmountCents: null },
    });

    expect(outcome.kind).toBe("added");
    expect(insertCharge).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 2,
      unitAmountCents: 142_500,
      taxRateBasisPoints: 1800,
      amountCents: 285_000,
      currency: "INR",
      createdByStaffId: "staff-1",
    });
  });

  it("uses staff's own price and wording for a custom charge", async () => {
    await addClientCharge({
      businessId: BUSINESS,
      staffUserId: "staff-1",
      request: { kind: "custom", quantity: 1, description: "Logo refresh", customUnitAmountCents: 250_000 },
    });

    expect(insertCharge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ description: "Logo refresh", unitAmountCents: 250_000, amountCents: 250_000 }),
    );
  });

  it("adds nothing when there is no plan to price from", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ plan: null } as never);
    const outcome = await addClientCharge({
      businessId: BUSINESS,
      staffUserId: "staff-1",
      request: { kind: "extra_publish", quantity: 1, description: null, customUnitAmountCents: null },
    });
    expect(outcome).toEqual({ kind: "no-plan" });
    expect(insertCharge).not.toHaveBeenCalled();
  });
});

describe("markClientChargePaid", () => {
  const details = { reference: "NEFT 123", receivedOn: "2026-10-01" };

  it("records the charge's own amount as a manual payment, under the billing lock", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValue(OPEN_CHARGE);
    vi.mocked(recordChargePaymentWithInvoice).mockResolvedValue({ outcome: "paid", alreadyRecorded: false, payment: {} as never });

    await expect(
      markClientChargePaid({ businessId: BUSINESS, chargeId: "charge-1", staffUserId: "staff-1", details }, NOW),
    ).resolves.toBe("paid");
    expect(lockBusinessForBilling).toHaveBeenCalledWith({ name: "staff-tx" }, BUSINESS);
    expect(recordChargePaymentWithInvoice).toHaveBeenCalledWith(
      { name: "staff-tx" },
      expect.objectContaining({
        provider: "manual",
        amountCents: 285_000,
        currency: "INR",
        manual: { recordedByStaffId: "staff-1", reference: "NEFT 123", receivedOn: "2026-10-01" },
      }),
    );
    expect(finishAddOnAfterPayment).toHaveBeenCalledWith({ name: "basket-deps" }, { businessId: BUSINESS, chargeId: "charge-1", now: NOW });
  });

  it("writes nothing for a charge already settled, or not the client's", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValueOnce({ ...OPEN_CHARGE, status: "waived" });
    await expect(
      markClientChargePaid({ businessId: BUSINESS, chargeId: "charge-1", staffUserId: "staff-1", details }, NOW),
    ).resolves.toBe("not-open");

    vi.mocked(findChargeForBusiness).mockResolvedValueOnce(null);
    await expect(
      markClientChargePaid({ businessId: BUSINESS, chargeId: "charge-1", staffUserId: "staff-1", details }, NOW),
    ).resolves.toBe("not-found");
    expect(recordChargePaymentWithInvoice).not.toHaveBeenCalled();
  });
});
