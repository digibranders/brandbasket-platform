import { describe, expect, it } from "vitest";
import { websiteMilestones } from "@/lib/home/milestones";
import type { ClientHomeState } from "@/lib/home/state";

const input = { kickoffAt: new Date("2026-10-30T10:30:00Z"), firstPreviewDueAt: new Date("2026-11-01T10:30:00Z") };
const states = (state: ClientHomeState, facts = input) => websiteMilestones(state, facts).map((item) => item.state);

describe("websiteMilestones", () => {
  it("has the kickoff done and the building now while the website is built, with the stored preview date", () => {
    const items = websiteMilestones({ kind: "building", dueAt: input.firstPreviewDueAt }, input);
    expect(items.map((item) => item.label)).toEqual(["Kickoff", "Building", "Your review", "Changes", "Live"]);
    expect(items.map((item) => item.state)).toEqual(["done", "now", "next", "next", "next"]);
    expect(items[0]?.note).toBe("Fri 30 Oct");
    expect(items[1]?.note).toBe("Preview by Sun 1 Nov");
  });

  it("leaves a date out when none is stored, and does not guess one", () => {
    const items = websiteMilestones({ kind: "starting" }, { kickoffAt: null, firstPreviewDueAt: null });
    expect(items[0]?.note).toBeNull();
    expect(items[1]?.note).toBe("Now");
  });

  it("moves the bar on through review, changes and approval", () => {
    expect(states({ kind: "preview_ready" })).toEqual(["done", "done", "now", "next", "next"]);
    expect(states({ kind: "revisions" })).toEqual(["done", "done", "done", "now", "next"]);
    expect(states({ kind: "approved" })).toEqual(["done", "done", "done", "done", "now"]);
  });

  it("says a paused build is paused, in the building bar", () => {
    const items = websiteMilestones({ kind: "on_hold", reason: "x" }, input);
    expect(items[1]).toMatchObject({ state: "now", note: "Paused" });
  });
});
