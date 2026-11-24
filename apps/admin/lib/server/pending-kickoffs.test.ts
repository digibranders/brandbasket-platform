import { listPendingKickoffPrompts } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadKickoffPrompts } from "./pending-kickoffs";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listPendingKickoffPrompts: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({})) }));

const NOW = new Date("2026-11-14T10:00:00Z");
const call = (callId: string, lastPopupShownAt: Date | null) => ({
  callId,
  businessId: `b-${callId}`,
  businessName: `Cafe ${callId}`,
  startsAt: new Date("2026-11-14T09:00:00Z"),
  endsAt: new Date("2026-11-14T09:30:00Z"),
  firstNotifiedAt: null,
  lastPopupShownAt,
  answeredAt: null,
  reminderPushedAt: null,
});

beforeEach(() => vi.resetAllMocks());

describe("loadKickoffPrompts", () => {
  it("returns every pending call and marks as due the ones never shown or shown 15 minutes ago", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([
      call("never", null),
      call("recent", new Date("2026-11-14T09:50:00Z")),
      call("stale", new Date("2026-11-14T09:45:00Z")),
    ]);
    const items = await loadKickoffPrompts(NOW);
    expect(listPendingKickoffPrompts).toHaveBeenCalledWith({}, { now: NOW, lookBackDays: 14 });
    expect(items.map((item) => [item.callId, item.due])).toEqual([
      ["never", true],
      ["recent", false],
      ["stale", true],
    ]);
  });

  it("returns an empty list when nothing is waiting", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([]);
    expect(await loadKickoffPrompts(NOW)).toEqual([]);
  });
});
