// @vitest-environment node
import { clearKickoffPromptStateForBusiness } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notify } from "@/platform/lib/server/notifier";
import { reportError } from "@/lib/report";
import { noticeKickoffBooked } from "./kickoff-booked-notice";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getStaffDb: () => ({}) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/platform/lib/server/notifier", () => ({ notify: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, clearKickoffPromptStateForBusiness: vi.fn() };
});

const STARTS = new Date("2026-11-17T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notify).mockResolvedValue({ event: "kickoff.booked", recipients: [], failed: false });
});

describe("noticeKickoffBooked", () => {
  it("forgets the old time's prompt state, then tells the person who booked, once per time", async () => {
    await noticeKickoffBooked({ businessId: "business-1", userId: "user-1" }, STARTS);
    expect(clearKickoffPromptStateForBusiness).toHaveBeenCalledWith({}, "business-1");
    expect(notify).toHaveBeenCalledWith({
      event: "kickoff.booked",
      audience: { kind: "customer", businessId: "business-1", userIds: ["user-1"] },
      dedupeKey: `business-1:${STARTS.toISOString()}`,
      data: { when: "Tue 17 Nov, 2:30 pm IST" },
    });
  });

  it("reports a failure and never throws into the booking", async () => {
    vi.mocked(notify).mockRejectedValue(new Error("no origins"));
    await expect(noticeKickoffBooked({ businessId: "business-1", userId: "user-1" }, STARTS)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "calls.kickoff-booked-notice" });
  });
});
