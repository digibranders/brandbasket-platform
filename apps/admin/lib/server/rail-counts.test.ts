import type { Lead } from "@brandbasket/db";
import { countSupportTicketsAwaitingStaff, listAddOnsToContact, listClients, listLeads, listPaymentsNeedingAttention } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countOrNothing, readRailCounts } from "./rail-counts";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    countSupportTicketsAwaitingStaff: vi.fn(),
    listAddOnsToContact: vi.fn(),
    listClients: vi.fn(),
    listLeads: vi.fn(),
    listPaymentsNeedingAttention: vi.fn(),
  };
});

const newLead = (id: string) => ({ id, businessName: `Business ${id}`, status: "new", createdAt: new Date("2026-11-30T03:00:00.000Z") }) as Lead;
const paidLead = { id: "paid", businessName: "Paid business", status: "paid", createdAt: new Date("2026-11-01T03:00:00.000Z") } as Lead;

beforeEach(() => {
  vi.mocked(listClients).mockResolvedValue([]);
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listAddOnsToContact).mockResolvedValue([]);
  vi.mocked(listLeads).mockImplementation(async (_db, filter) => (filter.status === "new" ? [newLead("a"), newLead("b")] : [newLead("a"), newLead("b"), paidLead]));
  vi.mocked(countSupportTicketsAwaitingStaff).mockResolvedValue(3);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("countOrNothing", () => {
  it("returns the count it read", async () => {
    expect(await countOrNothing("leads", async () => 4)).toBe(4);
  });

  it("returns nothing and logs when the read fails", async () => {
    expect(await countOrNothing("requests", async () => Promise.reject(new Error("database down")))).toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("readRailCounts", () => {
  it("reads every count", async () => {
    expect(await readRailCounts()).toEqual({ today: 2, leads: 2, requests: 3 });
  });

  it("leaves out a count it could not read and keeps the rest", async () => {
    vi.mocked(countSupportTicketsAwaitingStaff).mockRejectedValue(new Error("database down"));
    expect(await readRailCounts()).toEqual({ today: 2, leads: 2 });
  });
});
