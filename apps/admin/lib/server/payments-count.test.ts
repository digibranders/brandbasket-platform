import { countPaymentsNeedingStaff } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPaymentsCount } from "./payments-count";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, countPaymentsNeedingStaff: vi.fn() };
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(countPaymentsNeedingStaff).mockResolvedValue(3);
});

describe("readPaymentsCount", () => {
  it("counts flagged payments and failures since the start of this month in India", async () => {
    expect(await readPaymentsCount(new Date("2026-11-30T20:00:00.000Z"))).toBe(3);
    // 20:00 UTC on 30 November is already 1 December in India.
    expect(countPaymentsNeedingStaff).toHaveBeenCalledWith({ name: "staff-db" }, new Date("2026-12-01T00:00:00+05:30"));
  });
});
