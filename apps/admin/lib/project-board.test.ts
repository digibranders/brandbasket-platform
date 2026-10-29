import type { StaffProjectRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { boardColumns, filterByBuilder, type BoardColumnKey } from "./project-board";

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
  it("always returns the eight columns in order, with the staff stage labels", () => {
    expect(boardColumns([], NOW).map((column) => [column.key, column.label])).toEqual([
      ["waiting-kickoff", "Waiting for kickoff"],
      ["ready", "Ready to start"],
      ["building", "Building"],
      ["awaiting-review", "Awaiting client review"],
      ["changes", "Changes requested"],
      ["approved", "Approved, ready to launch"],
      ["on-hold", "On hold"],
      ["live", "Live this month"],
    ]);
  });

  it.each<[StaffProjectRow["status"], BoardColumnKey]>([
    ["onboarding", "waiting-kickoff"],
    ["submitted", "ready"],
    ["building", "building"],
    ["preview", "awaiting-review"],
    ["revisions", "changes"],
    ["approved", "approved"],
    ["on_hold", "on-hold"],
    ["live", "live"],
  ])("puts a %s build in the %s column", (status, key) => {
    const columns = boardColumns([row({ projectId: "p", status })], NOW);
    expect(columns.filter((column) => column.cards.length > 0).map((column) => column.key)).toEqual([key]);
  });

  it("marks a build past its due date as late, and one due today as due today", () => {
    const columns = boardColumns(
      [
        row({ projectId: "late", slaDueAt: new Date("2026-11-28T06:00:00.000Z"), builderName: "Rohit" }),
        row({ projectId: "today", slaDueAt: new Date("2026-11-30T12:30:00.000Z") }),
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

  it("keeps the same due note for a submitted build, which now sits in Ready to start", () => {
    const columns = boardColumns([row({ projectId: "submitted", status: "submitted", slaDueAt: new Date("2026-11-30T12:30:00.000Z") })], NOW);
    const ready = columns.find((column) => column.key === "ready");
    expect(ready?.cards.map((card) => [card.row.projectId, card.note, card.due, card.late, card.dueSoon])).toEqual([
      ["submitted", "No builder", "due today", false, true],
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
