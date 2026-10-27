import { countCallsBetween, countLateProjects, countLeadsToContact, countSupportTicketsAwaitingStaff } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countOrNothing, readRailCounts } from "./rail-counts";
import { countTodayItems } from "./today";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("./today", () => ({ countTodayItems: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, countCallsBetween: vi.fn(), countLateProjects: vi.fn(), countLeadsToContact: vi.fn(), countSupportTicketsAwaitingStaff: vi.fn() };
});

beforeEach(() => {
  vi.mocked(countTodayItems).mockResolvedValue(5);
  vi.mocked(countLeadsToContact).mockResolvedValue(4);
  vi.mocked(countSupportTicketsAwaitingStaff).mockResolvedValue(3);
  vi.mocked(countLateProjects).mockResolvedValue(1);
  vi.mocked(countCallsBetween).mockResolvedValue(2);
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
  it("reads every count, late builds and today's calls included", async () => {
    expect(await readRailCounts()).toEqual({ today: 5, leads: 4, requests: 3, projects: 1, calls: 2 });
  });

  it("counts calls between India midnight and the next", async () => {
    await readRailCounts();
    const [, from, until] = vi.mocked(countCallsBetween).mock.calls[0] ?? [];
    expect((until as Date).getTime() - (from as Date).getTime()).toBe(86_400_000);
  });

  it("leaves out a count it could not read and keeps the rest", async () => {
    vi.mocked(countLateProjects).mockRejectedValue(new Error("database down"));
    expect(await readRailCounts()).toEqual({ today: 5, leads: 4, requests: 3, calls: 2 });
  });
});
