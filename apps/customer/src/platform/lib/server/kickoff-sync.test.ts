// @vitest-environment node
import { addActivityEvent, listKickoffsToStart, markProjectReadyAfterKickoff } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kickoffStartMode, startBuildsAfterKickoff } from "./kickoff-sync";
import { notify } from "./notifier";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("./notifier", () => ({ notify: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, addActivityEvent: vi.fn(), listKickoffsToStart: vi.fn(), markProjectReadyAfterKickoff: vi.fn() };
});

const NOW = new Date("2026-10-30T12:00:00.000Z");
// KICKOFF_FALLBACK_START_HOURS (24) before NOW: the cut-off for a call nobody marked, which the sync passes in both modes.
const ENDED_BEFORE = new Date("2026-10-29T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listKickoffsToStart).mockResolvedValue([]);
  vi.mocked(markProjectReadyAfterKickoff).mockResolvedValue(true);
  vi.mocked(notify).mockResolvedValue({ event: "kickoff.fallback_started", recipients: [], failed: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("kickoffStartMode", () => {
  it("is auto when the switch is on, unset or empty", () => {
    expect(kickoffStartMode({ KICKOFF_AUTO_START: "on" })).toBe("auto");
    expect(kickoffStartMode({})).toBe("auto");
    expect(kickoffStartMode({ KICKOFF_AUTO_START: "  " })).toBe("auto");
  });

  it("is confirmed-only when the switch is off", () => {
    expect(kickoffStartMode({ KICKOFF_AUTO_START: "off" })).toBe("confirmed-only");
  });

  it("refuses any other value rather than guessing", () => {
    expect(() => kickoffStartMode({ KICKOFF_AUTO_START: "sometimes" })).toThrow(/KICKOFF_AUTO_START must be on or off/);
  });
});

describe("startBuildsAfterKickoff", () => {
  it("in auto mode (the default), asks for the held kickoffs and those that ended over 24 hours ago with no mark", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "on");
    await startBuildsAfterKickoff(NOW);
    expect(listKickoffsToStart).toHaveBeenCalledWith({}, { endedBefore: ENDED_BEFORE, confirmedOnly: false });
  });

  it("in confirmed-only mode (KICKOFF_AUTO_START=off), asks only for the kickoffs staff marked held", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "off");
    await startBuildsAfterKickoff(NOW);
    expect(listKickoffsToStart).toHaveBeenCalledWith({}, { endedBefore: ENDED_BEFORE, confirmedOnly: true });
  });

  it("starts the build for a held kickoff the query returns, in confirmed-only mode", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "off");
    vi.mocked(listKickoffsToStart).mockResolvedValue([{ businessId: "business-held", businessName: "Held Cafe", endsAt: null, heldAt: NOW }]);
    const report = await startBuildsAfterKickoff(NOW);
    expect(report).toEqual({ checked: 1, started: 1, failed: 0 });
    expect(markProjectReadyAfterKickoff).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ businessId: "business-held", now: NOW, startedWithoutCallConfirmation: false }),
    );
    expect(addActivityEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ businessId: "business-held", service: "website", title: "Kickoff call completed" }),
    );
  });

  it("tells the customer a fallback build started in plain words, and keeps the staff label for staff", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "on");
    vi.mocked(listKickoffsToStart).mockResolvedValue([{ businessId: "business-fallback", businessName: "Fallback Cafe", endsAt: ENDED_BEFORE, heldAt: null }]);
    const report = await startBuildsAfterKickoff(NOW);
    expect(report).toEqual({ checked: 1, started: 1, failed: 0 });
    expect(markProjectReadyAfterKickoff).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ businessId: "business-fallback", now: NOW, startedWithoutCallConfirmation: true }),
    );
    // The activity line is what the customer reads under "What we did".
    expect(addActivityEvent).toHaveBeenCalledWith({}, expect.objectContaining({ businessId: "business-fallback", service: "website", title: "We started your website" }));
    expect(notify).toHaveBeenCalledWith({ event: "kickoff.fallback_started", audience: { kind: "customer", businessId: "business-fallback" }, dedupeKey: "business-fallback", data: {} });
    expect(notify).toHaveBeenCalledWith({ event: "kickoff.fallback_started.staff", audience: { kind: "staff", businessId: "business-fallback" }, dedupeKey: "business-fallback", data: { businessName: "Fallback Cafe" } });
  });

  it("sends no fallback notice for a call staff marked held", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "off");
    vi.mocked(listKickoffsToStart).mockResolvedValue([{ businessId: "business-held", businessName: "Held Cafe", endsAt: null, heldAt: NOW }]);
    await startBuildsAfterKickoff(NOW);
    expect(notify).not.toHaveBeenCalled();
  });

  it("still counts the build as started when a notice cannot be sent", async () => {
    vi.stubEnv("KICKOFF_AUTO_START", "on");
    vi.mocked(listKickoffsToStart).mockResolvedValue([{ businessId: "business-fallback", businessName: "Fallback Cafe", endsAt: ENDED_BEFORE, heldAt: null }]);
    vi.mocked(notify).mockRejectedValue(new Error("no origins"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await startBuildsAfterKickoff(NOW)).toEqual({ checked: 1, started: 1, failed: 0 });
    spy.mockRestore();
  });
});
