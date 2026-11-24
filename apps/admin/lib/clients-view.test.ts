import type { StaffProjectRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { buildsHref, buildsSummary, clientsListHref, parseClientsView } from "./clients-view";

const NOW = new Date("2026-11-20T09:00:00.000Z");

function row(overrides: Partial<StaffProjectRow>): StaffProjectRow {
  return {
    projectId: "p",
    businessId: "b",
    businessName: "Harbour Bakery",
    status: "building",
    slaDueAt: new Date(NOW.getTime() + 86_400_000),
    previewSentAt: null,
    launchedAt: null,
    callStartsAt: null,
    onHoldReason: null,
    builderName: null,
    revisionRoundsUsed: 0,
    revisionRoundsIncluded: 2,
    ...overrides,
  } as StaffProjectRow;
}

describe("parseClientsView", () => {
  it("is Builds only for view=builds, else the list", () => {
    expect(parseClientsView("builds")).toBe("builds");
    expect(parseClientsView(["builds", "list"])).toBe("builds");
    expect(parseClientsView(undefined)).toBe("list");
    expect(parseClientsView("board")).toBe("list");
  });
});

describe("addresses", () => {
  it("keeps the stage and search on the list and leaves the default scope off Builds", () => {
    expect(clientsListHref({ stage: null, search: "" })).toBe("/clients");
    expect(clientsListHref({ stage: "live", search: "bak" })).toBe("/clients?stage=live&q=bak");
    expect(buildsHref("needs-action")).toBe("/clients?view=builds");
    expect(buildsHref("late")).toBe("/clients?view=builds&show=late");
  });
});

describe("buildsSummary", () => {
  const rows = [
    row({ projectId: "ok" }),
    row({ projectId: "late", slaDueAt: new Date(NOW.getTime() - 86_400_000) }),
    row({ projectId: "hold", status: "on_hold" }),
    row({ projectId: "review", status: "preview", slaDueAt: null }),
  ];

  it("counts the late build and shows every card for all", () => {
    expect(buildsSummary(rows, "all", NOW).cards).toHaveLength(4);
    expect(buildsSummary(rows, "all", NOW).late).toBe(1);
  });

  it("narrows to late and to on hold", () => {
    expect(buildsSummary(rows, "late", NOW).cards.map((card) => card.row.projectId)).toEqual(["late"]);
    expect(buildsSummary(rows, "on-hold", NOW).cards.map((card) => card.row.projectId)).toEqual(["hold"]);
  });
});
