import { findLatestKickoffOutcome } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMissedKickoffAt } from "./missed-kickoff";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ kind: "staff-db" })) }));
vi.mock("@brandbasket/db", () => ({ findLatestKickoffOutcome: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;
const STARTS = new Date("2026-10-29T09:15:00.000Z");
const ENDS = new Date("2026-10-29T09:45:00.000Z");
const outcome = (values: Partial<NonNullable<Awaited<ReturnType<typeof findLatestKickoffOutcome>>>>) => ({
  outcome: "customer_no_show" as const,
  note: null,
  callStartsAt: STARTS,
  callEndsAt: ENDS,
  recordedAt: new Date("2026-10-29T10:00:00.000Z"),
  recordedByStaffId: "staff-1",
  ...values,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadMissedKickoffAt", () => {
  it("reads the business in the session and gives the start of a call the customer missed or the team missed", async () => {
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue(outcome({ outcome: "customer_no_show" }));
    expect(await loadMissedKickoffAt(tenant)).toEqual(STARTS);
    expect(findLatestKickoffOutcome).toHaveBeenCalledWith({ kind: "staff-db" }, "business-1");
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue(outcome({ outcome: "team_no_show" }));
    expect(await loadMissedKickoffAt(tenant)).toEqual(STARTS);
  });

  it("falls back to the end time when the start was never saved, and to null when neither was", async () => {
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue(outcome({ callStartsAt: null }));
    expect(await loadMissedKickoffAt(tenant)).toEqual(ENDS);
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue(outcome({ callStartsAt: null, callEndsAt: null }));
    expect(await loadMissedKickoffAt(tenant)).toBeNull();
  });

  it("is null for any other outcome, or when none was recorded", async () => {
    for (const other of ["completed", "rescheduled", "unknown"] as const) {
      vi.mocked(findLatestKickoffOutcome).mockResolvedValue(outcome({ outcome: other }));
      expect(await loadMissedKickoffAt(tenant), other).toBeNull();
    }
    vi.mocked(findLatestKickoffOutcome).mockResolvedValue(null);
    expect(await loadMissedKickoffAt(tenant)).toBeNull();
  });

  it("logs a failed read and gives null, so Home still draws", async () => {
    vi.mocked(findLatestKickoffOutcome).mockRejectedValue(new Error("database down"));
    expect(await loadMissedKickoffAt(tenant)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
