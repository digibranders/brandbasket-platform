import { countActiveErrorIssues, deliveryHealth, type DeliveryHealth } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSystemHealth, SYSTEM_SOURCES, type SystemSource } from "./system-health";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ countActiveErrorIssues: vi.fn(), deliveryHealth: vi.fn() }));

const QUIET = { total: 0, failed: 0, lastOkAt: null, lastFailedAt: null };
const HEALTH: DeliveryHealth = {
  razorpay: { total: 38, failed: 0, lastOkAt: new Date("2026-11-30T04:28:00.000Z"), lastFailedAt: null },
  calcom: QUIET,
  oyechats: QUIET,
  brevo: { total: 81, failed: 2, lastOkAt: new Date("2026-11-30T03:28:00.000Z"), lastFailedAt: new Date("2026-11-30T04:28:00.000Z") },
  teams: { total: 15, failed: 0, lastOkAt: new Date("2026-11-30T04:28:00.000Z"), lastFailedAt: null },
};
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));

// 15:28 on Monday 30 November 2026 in India.
const NOW = new Date("2026-11-30T09:58:00.000Z");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readSystemHealth", () => {
  it("reports a source that fails to read as one that needs a look, and keeps the rest", async () => {
    const working: SystemSource = { key: "ok", label: "Working", read: async () => ({ state: "ok", detail: "fine" }) };
    const broken: SystemSource = { key: "broken", label: "Broken", read: async () => { throw new Error("down"); } };
    expect(await readSystemHealth(NOW, [working, broken])).toEqual([
      { key: "ok", label: "Working", state: "ok", detail: "fine" },
      { key: "broken", label: "Broken", state: "warn", detail: "could not check" },
    ]);
  });

  it("lists every delivery source over the last 24 hours, then the open errors", async () => {
    vi.mocked(deliveryHealth).mockResolvedValue(HEALTH);
    vi.mocked(countActiveErrorIssues).mockResolvedValue(2);
    expect(await readSystemHealth(NOW, SYSTEM_SOURCES)).toEqual([
      { key: "razorpay", label: "Razorpay payments", state: "ok", detail: "last 09:58" },
      { key: "calcom", label: "Cal.com bookings", state: "ok", detail: "none in 24 hours" },
      { key: "oyechats", label: "OyeChats leads", state: "ok", detail: "none in 24 hours" },
      { key: "brevo", label: "Brevo email", state: "bad", detail: "2 not sent" },
      { key: "teams", label: "Teams alerts", state: "ok", detail: "all sent" },
      { key: "errors", label: "Website errors", state: "bad", detail: "2 open" },
    ]);
  });

  it("reads the delivery figures once for all five sources, from 24 hours before now", async () => {
    vi.mocked(deliveryHealth).mockClear();
    vi.mocked(deliveryHealth).mockResolvedValue(HEALTH);
    vi.mocked(countActiveErrorIssues).mockResolvedValue(0);
    // A moment no other test uses, so the per-render cache cannot answer from an earlier test.
    const later = new Date("2026-11-30T10:00:00.000Z");
    await readSystemHealth(later, SYSTEM_SOURCES);
    expect(deliveryHealth).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliveryHealth).mock.calls[0]?.[1]).toEqual(new Date("2026-11-29T10:00:00.000Z"));
  });
});
