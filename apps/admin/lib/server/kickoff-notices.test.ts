import { beforeEach, describe, expect, it, vi } from "vitest";
import { noticeKickoffAnswered } from "./kickoff-notices";
import { notify } from "./notifier";

vi.mock("server-only", () => ({}));
vi.mock("./notifier", () => ({ notify: vi.fn() }));

const STARTS = new Date("2026-11-17T09:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notify).mockResolvedValue({ event: "kickoff.completed", recipients: [], failed: false });
});

describe("noticeKickoffAnswered", () => {
  it("thanks the customer once after Call completed", async () => {
    await noticeKickoffAnswered({ answer: "completed", businessId: "b-1", startsAt: STARTS });
    expect(notify).toHaveBeenCalledWith({ event: "kickoff.completed", audience: { kind: "customer", businessId: "b-1" }, dedupeKey: "b-1", data: {} });
  });

  it("says they missed each other, with the call time, after They did not join", async () => {
    await noticeKickoffAnswered({ answer: "not_joined", businessId: "b-1", startsAt: STARTS });
    expect(notify).toHaveBeenCalledWith({
      event: "kickoff.not_joined",
      audience: { kind: "customer", businessId: "b-1" },
      dedupeKey: `b-1:${STARTS.toISOString()}`,
      data: { when: "Tue 17 Nov, 2:30 pm IST" },
    });
  });

  it("asks for a new time after Reschedule", async () => {
    await noticeKickoffAnswered({ answer: "reschedule", businessId: "b-1", startsAt: STARTS });
    expect(notify).toHaveBeenCalledWith({ event: "kickoff.reschedule", audience: { kind: "customer", businessId: "b-1" }, dedupeKey: `b-1:${STARTS.toISOString()}`, data: {} });
  });

  it("sends no missed notice when the call had no time to name", async () => {
    await noticeKickoffAnswered({ answer: "not_joined", businessId: "b-1", startsAt: null });
    expect(notify).not.toHaveBeenCalled();
  });

  it("never throws into the staff action", async () => {
    vi.mocked(notify).mockRejectedValue(new Error("no origins"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(noticeKickoffAnswered({ answer: "completed", businessId: "b-1", startsAt: null })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
