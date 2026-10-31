import { addActivityEvent, listKickoffsToStart, markProjectReadyAfterKickoff } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kickoffStartMode, startBuildsAfterKickoff } from "./kickoff-sync";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, addActivityEvent: vi.fn(), listKickoffsToStart: vi.fn(), markProjectReadyAfterKickoff: vi.fn() };
});

const NOW = new Date("2026-10-30T12:00:00.000Z");
// KICKOFF_SETTLE_HOURS (2) before NOW: the elapsed-time cut-off the sync passes in "auto" mode.
const ENDED_BEFORE = new Date("2026-10-30T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listKickoffsToStart).mockResolvedValue([]);
  vi.mocked(markProjectReadyAfterKickoff).mockResolvedValue(true);
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
  it("in auto mode (the default), asks for the kickoffs that ended, held or not", async () => {
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
    vi.mocked(listKickoffsToStart).mockResolvedValue([{ businessId: "business-held", endsAt: null, heldAt: NOW }]);
    const report = await startBuildsAfterKickoff(NOW);
    expect(report).toEqual({ checked: 1, started: 1, failed: 0 });
    expect(markProjectReadyAfterKickoff).toHaveBeenCalledWith({}, expect.objectContaining({ businessId: "business-held", now: NOW }));
    expect(addActivityEvent).toHaveBeenCalledTimes(1);
  });
});
