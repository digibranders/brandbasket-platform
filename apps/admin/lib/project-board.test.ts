import type { StaffProjectRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { boardColumns, filterByBuilder } from "./project-board";

const NOW = new Date("2026-11-30T06:00:00.000Z");

function row(overrides: Partial<StaffProjectRow>): StaffProjectRow {
  return {
    projectId: "p",
    businessId: "b",
    businessName: "Om Sweets",
    status: "building",
    slaDueAt: null,
    previewSentAt: null,
    launchedAt: null,
    onHoldReason: null,
    revisionRoundsIncluded: 2,
    revisionRoundsUsed: 0,
    builderId: null,
    builderName: null,
    callStartsAt: null,
    ...overrides,
  };
}

describe("boardColumns", () => {
  it("always returns the six columns in order, with the mock's labels", () => {
    expect(boardColumns([], NOW).map((column) => column.label)).toEqual([
      "Waiting for call",
      "Building",
      "Preview sent",
      "Changes",
      "On hold",
      "Live this month",
    ]);
  });

  it("marks a build past its preview date as late, and one due today as due today", () => {
    const columns = boardColumns(
      [
        row({ projectId: "late", slaDueAt: new Date("2026-11-28T06:00:00.000Z"), builderName: "Rohit" }),
        row({ projectId: "today", status: "submitted", slaDueAt: new Date("2026-11-30T12:30:00.000Z") }),
        row({ projectId: "later", slaDueAt: new Date("2026-12-03T06:00:00.000Z"), builderName: "Ananya" }),
      ],
      NOW,
    );
    const building = columns.find((column) => column.key === "building");
    expect(building?.cards.map((card) => [card.row.projectId, card.note, card.due, card.late, card.dueSoon])).toEqual([
      ["late", "Rohit", "due 28 Nov", true, false],
      ["today", "No builder", "due today", false, true],
      ["later", "Ananya", "due 3 Dec", false, false],
    ]);
  });

  it("writes each column's note", () => {
    const columns = boardColumns(
      [
        row({ projectId: "call", status: "onboarding", callStartsAt: new Date("2026-11-30T06:00:00.000Z") }),
        row({ projectId: "nocall", status: "onboarding" }),
        row({ projectId: "preview", status: "preview", previewSentAt: new Date("2026-11-27T06:00:00.000Z") }),
        row({ projectId: "approved", status: "approved" }),
        row({ projectId: "changes", status: "revisions", revisionRoundsUsed: 1, builderName: "Rohit" }),
        row({ projectId: "hold", status: "on_hold", onHoldReason: "Waiting for photos" }),
        row({ projectId: "live", status: "live", launchedAt: new Date("2026-11-05T06:00:00.000Z") }),
      ],
      NOW,
    );
    const notes = Object.fromEntries(columns.flatMap((column) => column.cards.map((card) => [card.row.projectId, `${card.note}|${card.due}`])));
    expect(notes).toEqual({
      call: "Call today 11:30|",
      nocall: "No call booked|",
      preview: "Waiting for the client|sent 27 Nov",
      approved: "Approved, ready to go live|",
      changes: "Round 1 of 2 · Rohit|",
      hold: "Waiting for photos|",
      live: "Live 5 Nov|",
    });
  });

  it("leaves cancelled builds off the board", () => {
    expect(boardColumns([row({ status: "cancelled" })], NOW).every((column) => column.cards.length === 0)).toBe(true);
  });
});

describe("filterByBuilder", () => {
  const rows = [row({ projectId: "a", builderId: "s1" }), row({ projectId: "b", builderId: null })];

  it("keeps everything for anyone, a builder's own cards, or the unassigned ones", () => {
    expect(filterByBuilder(rows, null).map((r) => r.projectId)).toEqual(["a", "b"]);
    expect(filterByBuilder(rows, "s1").map((r) => r.projectId)).toEqual(["a"]);
    expect(filterByBuilder(rows, "none").map((r) => r.projectId)).toEqual(["b"]);
  });
});
