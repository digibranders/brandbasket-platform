import { countLeadsToContact, countSupportTicketsAwaitingStaff } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countOrNothing, readRailCounts } from "./rail-counts";
import { countTodayItems } from "./today";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./today", () => ({ countTodayItems: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, countLeadsToContact: vi.fn(), countSupportTicketsAwaitingStaff: vi.fn() };
});

beforeEach(() => {
  vi.mocked(countTodayItems).mockResolvedValue(5);
  vi.mocked(countLeadsToContact).mockResolvedValue(4);
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
  it("counts enquiries to contact for Enquiries", async () => {
    expect(await readRailCounts()).toEqual({ today: 5, leads: 4, requests: 3 });
  });

  it("leaves out the Enquiries count when it cannot be read and keeps the rest", async () => {
    vi.mocked(countLeadsToContact).mockRejectedValue(new Error("database down"));
    expect(await readRailCounts()).toEqual({ today: 5, requests: 3 });
  });
});
