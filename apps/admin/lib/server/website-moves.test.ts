import { addActivityEvent, ProjectNotPausedError, resumeProject, setProjectBuilding, setProjectOnHold, type Database, type Project } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addWorkingActivity, putOnHold, resumeBuilding, startBuilding } from "./website-moves";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => {
  class ProjectNotPausedError extends Error {}
  return { addActivityEvent: vi.fn(), ProjectNotPausedError, resumeProject: vi.fn(), setProjectBuilding: vi.fn(), setProjectOnHold: vi.fn() };
});

const db = {} as Database;
const NOW = new Date("2026-10-27T06:00:00.000Z");
const move = { businessId: "business-1", staffId: "staff-1" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(setProjectBuilding).mockResolvedValue({} as Project);
  vi.mocked(resumeProject).mockResolvedValue({} as Project);
  vi.mocked(setProjectOnHold).mockImplementation(async (_db, input) => ({ onHoldReason: input.reason.trim() }) as Project);
  vi.mocked(addActivityEvent).mockResolvedValue(undefined);
});

function lines(): string[] {
  return vi.mocked(addActivityEvent).mock.calls.map((call) => call[1].title);
}

describe("the staff moves", () => {
  it("start building moves the project and writes one dated line", async () => {
    await startBuilding(db, move, NOW);
    expect(setProjectBuilding).toHaveBeenCalledWith(db, { businessId: "business-1" });
    expect(lines()).toEqual(["We started building your website"]);
    expect(addActivityEvent).toHaveBeenCalledWith(db, { businessId: "business-1", service: "website", title: "We started building your website", occurredAt: NOW, staffId: "staff-1" });
  });

  it("resume writes the building-again line", async () => {
    vi.mocked(resumeProject).mockResolvedValue({ status: "building" } as Project);
    await resumeBuilding(db, move, NOW);
    expect(resumeProject).toHaveBeenCalledWith(db, { businessId: "business-1" });
    expect(lines()).toEqual(["We are building your website again"]);
  });

  it.each([
    ["submitted", "We resumed your website build"],
    ["preview", "Your website preview is waiting for you again"],
    ["revisions", "We are making your changes again"],
    ["building", "We are building your website again"],
  ] as const)("resume back to %s writes the line that says where the build is", async (status, title) => {
    vi.mocked(resumeProject).mockResolvedValue({ status } as Project);
    await resumeBuilding(db, move, NOW);
    expect(lines()).toEqual([title]);
  });

  it("put on hold writes the reason the database kept, not the raw input", async () => {
    await putOnHold(db, { ...move, reason: "  Waiting for your logo  " }, NOW);
    expect(setProjectOnHold).toHaveBeenCalledWith(db, { businessId: "business-1", reason: "  Waiting for your logo  " });
    expect(lines()).toEqual(["We paused your website build: Waiting for your logo"]);
  });

  it("cuts a long reason so the whole line is 140 characters", async () => {
    await putOnHold(db, { ...move, reason: "x".repeat(200) }, NOW);
    const [line] = lines();
    expect(line?.length).toBe(140);
    expect(line?.endsWith("…")).toBe(true);
  });

  it("does not fail the move when the line cannot be written", async () => {
    vi.mocked(addActivityEvent).mockRejectedValue(new Error("db down"));
    await expect(startBuilding(db, move, NOW)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("lets the database's refusal through and writes no line", async () => {
    vi.mocked(resumeProject).mockRejectedValue(new ProjectNotPausedError("business-1"));
    await expect(resumeBuilding(db, move, NOW)).rejects.toThrow(ProjectNotPausedError);
    expect(addActivityEvent).not.toHaveBeenCalled();
  });
});

describe("addWorkingActivity", () => {
  it("writes the website line and never throws", async () => {
    vi.mocked(addActivityEvent).mockRejectedValue(new Error("db down"));
    await expect(addWorkingActivity(db, { businessId: "business-1", staffId: "staff-1", title: "Your website preview is ready to check", now: NOW })).resolves.toBeUndefined();
  });
});
