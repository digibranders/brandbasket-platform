import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return { ...actual, consumeRateLimit: vi.fn(), findPlanUpgradeInFlight: vi.fn(), findPlanUpgradeByCharge: vi.fn() };
});
vi.mock("@firstfold/shared/server/plan-upgrade", () => ({
  assessUpgrade: vi.fn(),
  readAssessmentInput: vi.fn(),
  startUpgrade: vi.fn(),
  finishUpgradeAtProvider: vi.fn(),
}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn(() => ({ name: "fake" })) }));
vi.mock("./db", () => ({ getAppDb: () => ({ name: "app-db" }), getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./discount-plans", () => ({ ensureDiscountPlan: vi.fn() }));
vi.mock("./charges", () => ({ startCustomerChargePayment: vi.fn() }));

import { consumeRateLimit, findPlanUpgradeByCharge, findPlanUpgradeInFlight } from "@firstfold/db";
import { assessUpgrade, finishUpgradeAtProvider, readAssessmentInput, startUpgrade } from "@firstfold/shared/server/plan-upgrade";
import { startCustomerChargePayment } from "./charges";
import { startUpgradeFor, readUpgradePage } from "./plan-upgrade";
import { finishUpgrade, finishUpgradeForCharge } from "./plan-upgrade-finish";

const NOW = new Date("2026-10-10T09:00:00.000Z");
const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const CUSTOMER = { tenant: { userId: "user-1", businessId: BUSINESS, businessName: "Chennai Cafe", role: "owner" }, user: { id: "user-1" }, billing: {} } as never;
const UPGRADE = { id: "up-1", status: "paid" } as never;

beforeEach(() => {
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 0 });
});

describe("startUpgradeFor", () => {
  it("refuses without opening anything once the customer has asked too often", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    await expect(startUpgradeFor(CUSTOMER, NOW)).resolves.toMatchObject({ kind: "refused", message: expect.stringMatching(/lot of attempts/) });
    expect(startUpgrade).not.toHaveBeenCalled();
  });

  it("asks for the customer's own business, as the customer, with the configured provider, and nothing from the request", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "changed" });
    await startUpgradeFor(CUSTOMER, NOW);
    expect(startUpgrade).toHaveBeenCalledWith({ name: "staff-db" }, { businessId: BUSINESS, source: "customer", staffId: null, providerName: "fake", now: NOW });
    expect(consumeRateLimit).toHaveBeenCalledWith({ name: "app-db" }, `upgrade:business:${BUSINESS}`, expect.objectContaining({ limit: 20 }));
  });

  it("sends the customer to pay the charge that was opened", async () => {
    const start = { kind: "redirect", url: "/billing/charges/confirm?token=x" } as const;
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "pay", chargeId: "charge-1", upgrade: UPGRADE });
    vi.mocked(startCustomerChargePayment).mockResolvedValue(start);

    await expect(startUpgradeFor(CUSTOMER, NOW)).resolves.toEqual({ kind: "pay", start });
    expect(startCustomerChargePayment).toHaveBeenCalledWith(CUSTOMER, "charge-1");
  });

  it("finishes at the provider at once when there is nothing to pay", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "applied", upgrade: { id: "up-free" } as never });
    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue(null);
    vi.mocked(finishUpgradeAtProvider).mockResolvedValue({ kind: "scheduled" });

    await expect(startUpgradeFor(CUSTOMER, NOW)).resolves.toEqual({ kind: "applied" });
    expect(finishUpgradeAtProvider).toHaveBeenCalledWith(expect.objectContaining({ staffDb: { name: "staff-db" } }), "up-free", NOW);
  });

  it("says why in fixed words when it cannot be done, whatever the reason", async () => {
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "refused", assessment: { kind: "blocked", reason: "ending" } });
    expect(await startUpgradeFor(CUSTOMER, NOW)).toMatchObject({ kind: "refused", message: expect.stringMatching(/can’t move up/) });
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "refused", assessment: { kind: "unavailable", reason: "renewal-due" } });
    expect(await startUpgradeFor(CUSTOMER, NOW)).toMatchObject({ kind: "refused", message: expect.stringMatching(/can’t take an upgrade/) });
    vi.mocked(startUpgrade).mockResolvedValue({ kind: "changed" });
    expect(await startUpgradeFor(CUSTOMER, NOW)).toMatchObject({ kind: "refused", message: expect.stringMatching(/changed while/) });
  });
});

describe("readUpgradePage", () => {
  it("reads fresh from the database for the customer's own business", async () => {
    const input = { state: {}, premium: null, code: null, providerName: "fake", now: NOW } as never;
    vi.mocked(readAssessmentInput).mockResolvedValue(input);
    vi.mocked(assessUpgrade).mockReturnValue({ kind: "blocked", reason: "ending" });
    vi.mocked(findPlanUpgradeInFlight).mockResolvedValue(null);

    await expect(readUpgradePage(CUSTOMER, NOW)).resolves.toEqual({ assessment: { kind: "blocked", reason: "ending" }, inFlight: null });
    expect(readAssessmentInput).toHaveBeenCalledWith({ name: "staff-db" }, BUSINESS, "fake", NOW);
  });

  it("is nothing for a business that cannot be read", async () => {
    vi.mocked(readAssessmentInput).mockResolvedValue(null);
    await expect(readUpgradePage(CUSTOMER, NOW)).resolves.toBeNull();
  });
});

describe("finishing after the payment", () => {
  it("finishes a charge's move only when it is paid, and ignores a charge that bought no move", async () => {
    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue(UPGRADE);
    vi.mocked(finishUpgradeAtProvider).mockResolvedValue({ kind: "scheduled" });
    await finishUpgradeForCharge("charge-1", NOW);
    expect(finishUpgradeAtProvider).toHaveBeenCalledWith(expect.anything(), "up-1", NOW);

    vi.mocked(finishUpgradeAtProvider).mockClear();
    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue({ id: "up-2", status: "scheduled" } as never);
    await finishUpgradeForCharge("charge-2", NOW);
    vi.mocked(findPlanUpgradeByCharge).mockResolvedValue(null);
    await finishUpgradeForCharge("charge-3", NOW);
    expect(finishUpgradeAtProvider).not.toHaveBeenCalled();
  });

  it("never throws: the customer has paid and has Premium, so a failure is logged for staff", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(finishUpgradeAtProvider).mockRejectedValue(new Error("network down"));
    await expect(finishUpgrade("up-1", NOW)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("upgrade-provider-failed"));
    error.mockRestore();
  });
});
