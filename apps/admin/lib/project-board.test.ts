import type { StaffProjectRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { boardColumns, filterByBuilder, filterByScope, parseProjectScope, type BoardColumnKey } from "./project-board";

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

describe("filterByScope", () => {
  const EVERY_STATUS: readonly StaffProjectRow[] = (
    ["onboarding", "submitted", "building", "preview", "revisions", "approved", "live", "on_hold", "cancelled"] as const
  ).map((status) => row({ projectId: status, status }));

  function idsOf(rows: readonly StaffProjectRow[]): string[] {
    return rows.map((r) => r.projectId);
  }

  it("all keeps every row", () => {
    expect(idsOf(filterByScope(EVERY_STATUS, "all", NOW))).toEqual(idsOf(EVERY_STATUS));
  });

  it("needs-action keeps the statuses waiting on staff and drops the rest", () => {
    expect(idsOf(filterByScope(EVERY_STATUS, "needs-action", NOW))).toEqual(["submitted", "building", "revisions", "approved", "on_hold"]);
  });

  it("on-hold keeps only on_hold rows", () => {
    expect(idsOf(filterByScope(EVERY_STATUS, "on-hold", NOW))).toEqual(["on_hold"]);
  });

  it("late keeps submitted and building rows whose first preview promise has passed", () => {
    const rows = [
      row({ projectId: "submitted-late", status: "submitted", slaDueAt: new Date("2026-11-28T06:00:00.000Z") }),
      row({ projectId: "building-late", status: "building", slaDueAt: new Date("2026-11-29T06:00:00.000Z") }),
      row({ projectId: "building-future", status: "building", slaDueAt: new Date("2026-12-03T06:00:00.000Z") }),
      row({ projectId: "building-due-now", status: "building", slaDueAt: NOW }),
      row({ projectId: "building-no-sla", status: "building", slaDueAt: null }),
      row({ projectId: "revisions-past", status: "revisions", slaDueAt: new Date("2026-11-28T06:00:00.000Z") }),
      row({ projectId: "preview-past", status: "preview", slaDueAt: new Date("2026-11-28T06:00:00.000Z") }),
      row({ projectId: "approved-past", status: "approved", slaDueAt: new Date("2026-11-28T06:00:00.000Z") }),
    ];
    expect(idsOf(filterByScope(rows, "late", NOW))).toEqual(["submitted-late", "building-late"]);
  });

  it("late is empty when no submitted or building row has a promise date", () => {
    expect(filterByScope(EVERY_STATUS, "late", NOW)).toEqual([]);
  });
});

describe("parseProjectScope", () => {
  it.each<[string | undefined, ReturnType<typeof parseProjectScope>]>([
    [undefined, "needs-action"],
    ["", "needs-action"],
    ["bogus", "needs-action"],
    ["needs-action", "needs-action"],
    ["late", "late"],
    ["on-hold", "on-hold"],
    ["all", "all"],
  ])("reads %s as %s", (value, scope) => {
    expect(parseProjectScope(value)).toBe(scope);
  });
});
