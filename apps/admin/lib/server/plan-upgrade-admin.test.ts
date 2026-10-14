import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return {
    ...actual,
    findChargeForBusiness: vi.fn(),
    findPlanUpgradeByCharge: vi.fn(),
    findPlanUpgradeInFlight: vi.fn(),
    listPlanUpgradesForBusiness: vi.fn(),
    resolvePaymentAttention: vi.fn(),
  };
});
vi.mock("@firstfold/shared/server/plan-upgrade", () => ({
  assessUpgrade: vi.fn(),
  finishUpgradeAtProvider: vi.fn(),
  readAssessmentInput: vi.fn(),
  startUpgrade: vi.fn(),
}));
vi.mock("@firstfold/shared/server/discount-plans", () => ({ ensureDiscountPlanFor: vi.fn() }));
vi.mock("./billing-provider", () => ({ getBillingProvider: () => ({ name: "fake" }) }));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

import { findChargeForBusiness, findPlanUpgradeByCharge, findPlanUpgradeInFlight, listPlanUpgradesForBusiness, resolvePaymentAttention } from "@firstfold/db";
import { assessUpgrade, finishUpgradeAtProvider, readAssessmentInput, startUpgrade } from "@firstfold/shared/server/plan-upgrade";
import { finishClientUpgrade, finishUpgradeForChargeAfterManualPayment, moveClientToPremium, readClientUpgrade } from "./plan-upgrade-admin";

const NOW = new Date("2026-10-10T09:00:00.000Z");
const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const STAFF = "staff-1";
const PAID = { id: "up-1", status: "paid", chargeId: "charge-1", businessId: BUSINESS } as never;

beforeEach(() => {
  vi.mocked(finishUpgradeAtProvider).mockResolvedValue({ kind: "scheduled" });
});

describe("moveClientToPremium", () => {
  it("moves a client with nothing to take, as staff, allowing a bank-transfer client past the provider checks", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "applied", upgrade: { id: "up-staff" } as never });

    await expect(moveClientToPremium({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "moved", finish: { kind: "scheduled" } });

    expect(startUpgrade).toHaveBeenCalledWith(
      { name: "staff-db" },
      { businessId: BUSINESS, source: "staff", staffId: STAFF, providerName: "fake", now: NOW, allowBlocks: ["manual-billing"], noCharge: true },
    );
    expect(finishUpgradeAtProvider).toHaveBeenCalledWith(expect.objectContaining({ staffDb: { name: "staff-db" } }), "up-staff", NOW);
  });

  it("says when the provider step failed, since the client has Premium all the same", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "applied", upgrade: { id: "up-staff" } as never });
    vi.mocked(finishUpgradeAtProvider).mockResolvedValue({ kind: "failed", message: "no" });
    await expect(moveClientToPremium({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toMatchObject({ kind: "moved", finish: { kind: "failed" } });
  });

  it("refuses with a reason and touches no provider when the move cannot be made", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "refused", assessment: { kind: "blocked", reason: "ending" } });
    await expect(moveClientToPremium({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "refused", why: "blocked" });
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "refused", assessment: { kind: "unavailable", reason: "no-premium-plan" } });
    await expect(moveClientToPremium({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "refused", why: "unavailable" });
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "changed" });
    await expect(moveClientToPremium({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "refused", why: "changed" });
    expect(finishUpgradeAtProvider).not.toHaveBeenCalled();
  });
});

describe("finishClientUpgrade", () => {
  it("retries the provider step for a paid move, and marks the flagged payment dealt with by the staff member", async () => {
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue(PAID);
    vi.mocked(findChargeForBusiness).mockResolvedValue({ paymentId: "payment-1" } as never);

    await expect(finishClientUpgrade({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "scheduled" });

    expect(resolvePaymentAttention).toHaveBeenCalledWith({ name: "staff-db" }, { paymentId: "payment-1", businessId: BUSINESS, staffUserId: STAFF, now: NOW });
  });

  it("leaves the payment flagged when the provider still refuses", async () => {
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue(PAID);
    vi.mocked(finishUpgradeAtProvider).mockResolvedValue({ kind: "failed", message: "no" });
    await expect(finishClientUpgrade({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toMatchObject({ kind: "failed" });
    expect(resolvePaymentAttention).not.toHaveBeenCalled();
  });

  it("does nothing when there is no paid move waiting", async () => {
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue(null);
    await expect(finishClientUpgrade({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "nothing" });
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue({ id: "up-2", status: "scheduled" } as never);
    await expect(finishClientUpgrade({ businessId: BUSINESS, staffUserId: STAFF }, NOW)).resolves.toEqual({ kind: "nothing" });
    expect(finishUpgradeAtProvider).not.toHaveBeenCalled();
  });
});

describe("a bank transfer that pays for a move up", () => {
  it("finishes a paid move at the provider, and ignores a charge that bought none", async () => {
    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue(PAID);
    await finishUpgradeForChargeAfterManualPayment("charge-1", NOW);
    expect(finishUpgradeAtProvider).toHaveBeenCalledTimes(1);

    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue(null);
    await finishUpgradeForChargeAfterManualPayment("charge-2", NOW);
    expect(finishUpgradeAtProvider).toHaveBeenCalledTimes(1);
  });
});

describe("readClientUpgrade", () => {
  it("looks past a bank-transfer client's block, since staff are the ones who move it", async () => {
    const input = { state: {} } as never;
    vi.mocked(readAssessmentInput).mockResolvedValue(input);
    vi.mocked(assessUpgrade).mockReturnValue({ kind: "blocked", reason: "manual-billing" });
    vi.mocked(listPlanUpgradesForBusiness).mockResolvedValue([]);
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue(PAID);

    const result = await readClientUpgrade(BUSINESS, NOW);

    expect(assessUpgrade).toHaveBeenCalledWith({ state: {}, allow: ["manual-billing"] });
    expect(result?.needsFinishing).toEqual(PAID);
  });

  it("is nothing for a business that cannot be read", async () => {
    vi.mocked(readAssessmentInput).mockResolvedValue(null);
    await expect(readClientUpgrade(BUSINESS, NOW)).resolves.toBeNull();
  });
});
