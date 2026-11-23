// @vitest-environment node
import { listKickoffsStartingSoon, listPendingKickoffPrompts, markKickoffFirstNotified, markKickoffReminderPushed, type PendingKickoffPrompt } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendKickoffNotices } from "./kickoff-notices";
import { notify } from "./notifier";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("./notifier", () => ({ notify: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listKickoffsStartingSoon: vi.fn(), listPendingKickoffPrompts: vi.fn(), markKickoffFirstNotified: vi.fn(), markKickoffReminderPushed: vi.fn() };
});

const NOW = new Date("2026-11-17T12:00:00.000Z");
const ago = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);

function pending(overrides: Partial<PendingKickoffPrompt> = {}): PendingKickoffPrompt {
  return {
    callId: "call-1",
    businessId: "business-1",
    businessName: "Asha Cafe",
    startsAt: ago(60),
    endsAt: ago(30),
    firstNotifiedAt: null,
    lastPopupShownAt: null,
    answeredAt: null,
    reminderPushedAt: null,
    ...overrides,
  };
}

const delivered = { event: "kickoff.ended", recipients: [], failed: false } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPendingKickoffPrompts).mockResolvedValue([]);
  vi.mocked(listKickoffsStartingSoon).mockResolvedValue([]);
  vi.mocked(notify).mockResolvedValue(delivered);
});

describe("sendKickoffNotices", () => {
  it("tells staff once when a call has ended, keyed by the call and its end time, and notes it", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([pending()]);
    const report = await sendKickoffNotices(NOW);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      event: "kickoff.ended",
      audience: { kind: "staff", businessId: "business-1" },
      dedupeKey: `call-1:${ago(30).toISOString()}`,
      data: { businessName: "Asha Cafe" },
    });
    expect(markKickoffFirstNotified).toHaveBeenCalledWith({}, "call-1", NOW);
    expect(report).toEqual({ ended: 1, reminders: 0, soon: 0 });
  });

  it("does not tell staff again for a call it already told them about", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([pending({ firstNotifiedAt: ago(10) })]);
    expect(await sendKickoffNotices(NOW)).toEqual({ ended: 0, reminders: 0, soon: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not note a call as notified when the notice failed, so the next run tries again", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([pending()]);
    vi.mocked(notify).mockResolvedValue({ ...delivered, failed: true });
    expect(await sendKickoffNotices(NOW)).toEqual({ ended: 0, reminders: 0, soon: 0 });
    expect(markKickoffFirstNotified).not.toHaveBeenCalled();
  });

  it("sends one reminder push when the call is still unanswered 2 hours after it ended", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([pending({ endsAt: ago(121), firstNotifiedAt: ago(100) })]);
    const report = await sendKickoffNotices(NOW);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: "kickoff.ended.reminder", audience: { kind: "staff", businessId: "business-1" }, data: {} }));
    expect(markKickoffReminderPushed).toHaveBeenCalledWith({}, "call-1", NOW);
    expect(report).toEqual({ ended: 0, reminders: 1, soon: 0 });
  });

  it("sends no reminder before 2 hours or after the reminder went out", async () => {
    vi.mocked(listPendingKickoffPrompts).mockResolvedValue([
      pending({ callId: "early", endsAt: ago(119), firstNotifiedAt: ago(100) }),
      pending({ callId: "done", endsAt: ago(300), firstNotifiedAt: ago(290), reminderPushedAt: ago(180) }),
    ]);
    expect(await sendKickoffNotices(NOW)).toEqual({ ended: 0, reminders: 0, soon: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells the customer an hour before, once per call time, with the time of day", async () => {
    vi.mocked(listKickoffsStartingSoon).mockResolvedValue([{ callId: "call-2", businessId: "business-2", startsAt: new Date("2026-11-17T12:45:00.000Z") }]);
    const report = await sendKickoffNotices(NOW);
    expect(listKickoffsStartingSoon).toHaveBeenCalledWith({}, { now: NOW, withinMs: 3_600_000 });
    expect(notify).toHaveBeenCalledWith({
      event: "kickoff.soon",
      audience: { kind: "customer", businessId: "business-2" },
      dedupeKey: "call-2:2026-11-17T12:45:00.000Z",
      data: { when: "6:15 pm IST" },
    });
    expect(report).toEqual({ ended: 0, reminders: 0, soon: 1 });
  });

  it("keeps going when one call's lookup fails, and counts only what went out", async () => {
    vi.mocked(listPendingKickoffPrompts).mockRejectedValue(new Error("db down"));
    vi.mocked(listKickoffsStartingSoon).mockResolvedValue([{ callId: "call-2", businessId: "business-2", startsAt: new Date("2026-11-17T12:45:00.000Z") }]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendKickoffNotices(NOW)).toEqual({ ended: 0, reminders: 0, soon: 1 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
