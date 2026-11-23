import { listClients } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMoneyCount } from "./money-count";
import { readPaymentsCount } from "./payments-count";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./payments-count", () => ({ readPaymentsCount: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listClients: vi.fn() };
});

const NOW = new Date("2026-11-20T10:00:00.000Z");
const pastDue = {
  businessId: "b1",
  businessName: "Client 1",
  billing: {
    subscription: { status: "past_due", provider: "razorpay", billingInterval: "month", activatedAt: NOW, paidThroughAt: new Date("2026-11-17T10:00:00.000Z"), commitmentEndsAt: null },
    firstPayment: { amountCents: 299900, currency: "INR", provider: "razorpay", paidAt: NOW, manual: null },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readPaymentsCount).mockResolvedValue(2);
});

describe("readMoneyCount", () => {
  it("adds plans past due to the flagged and failed payments", async () => {
    vi.mocked(listClients).mockResolvedValue([pastDue] as never);
    expect(await readMoneyCount(NOW)).toBe(3);
  });

  it("is the payments count when no plan is overdue", async () => {
    vi.mocked(listClients).mockResolvedValue([]);
    expect(await readMoneyCount(NOW)).toBe(2);
  });
});
