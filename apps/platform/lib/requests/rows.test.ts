import type { ChangeView, RequestListItem } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { chooseView, includedHeaderLine, requestRows, splitRows } from "./rows";

function change(overrides: Partial<ChangeView>): ChangeView {
  return {
    id: "request-1",
    ticketId: "ticket-1",
    businessId: "business-1",
    kind: "website",
    page: null,
    state: "requested",
    coverage: "undecided",
    quote: null,
    acceptedAt: null,
    chargeId: null,
    chargeStatus: null,
    closedReason: null,
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    updatedAt: new Date("2026-11-27T12:30:00.000Z"),
    ...overrides,
  };
}

function item(overrides: Partial<RequestListItem>): RequestListItem {
  return {
    ticketId: "ticket-1",
    displayRef: "FY-1",
    subject: "Add an Implants page",
    ticketStatus: "new",
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    lastActivityAt: new Date("2026-11-27T12:30:00.000Z"),
    unread: false,
    change: null,
    ...overrides,
  };
}

describe("requestRows", () => {
  it("writes the title, the status in the five words and 'Website · 27 Nov'", () => {
    const [row] = requestRows([item({ change: change({ state: "quoted", coverage: "paid" }) })]);
    expect(row).toEqual({ ticketId: "ticket-1", title: "Add an Implants page", word: "Quoted", tone: "waiting", sub: "Website · 27 Nov", unread: false, open: true });
  });

  it("puts the customer's turn (Quoted, Ready to check) apart from ours", () => {
    const tones = (state: ChangeView["state"]) => requestRows([item({ change: change({ state, coverage: "free" }) })])[0]?.tone;
    expect(tones("quoted")).toBe("waiting");
    expect(tones("preview")).toBe("waiting");
    expect(tones("requested")).toBe("progress");
    expect(tones("in_progress")).toBe("progress");
    expect(tones("revisions")).toBe("progress");
    expect(tones("shipped")).toBe("done");
    expect(tones("declined")).toBe("closed");
  });

  it("gives a question the same words and calls it a question", () => {
    const rows = requestRows([
      item({ ticketStatus: "new" }),
      item({ ticketId: "t2", ticketStatus: "waiting_on_you", unread: true }),
      item({ ticketId: "t3", ticketStatus: "resolved" }),
    ]);
    expect(rows.map((row) => [row.word, row.sub, row.unread])).toEqual([
      ["Sent", "Question · 27 Nov", false],
      ["In progress", "Question · 27 Nov", true],
      ["Done", "Question · 27 Nov", false],
    ]);
  });

  it("names each kind in the words of the form", () => {
    const sub = (kind: ChangeView["kind"]) => requestRows([item({ change: change({ kind }) })])[0]?.sub;
    expect([sub("social"), sub("search"), sub("billing"), sub("other")]).toEqual([
      "Social & Ads · 27 Nov",
      "Search · 27 Nov",
      "Billing · 27 Nov",
      "Something else · 27 Nov",
    ]);
  });
});

describe("splitRows", () => {
  it("files what is going on as Open and what is over, one way or another, as Done", () => {
    const rows = requestRows([
      item({ ticketId: "a", change: change({ state: "quoted", coverage: "paid" }) }),
      item({ ticketId: "b", change: change({ state: "shipped", coverage: "free" }) }),
      item({ ticketId: "c", change: change({ state: "withdrawn" }) }),
      item({ ticketId: "d", ticketStatus: "closed" }),
      item({ ticketId: "e", ticketStatus: "triaged" }),
    ]);
    const { open, done } = splitRows(rows);
    expect(open.map((row) => row.ticketId)).toEqual(["a", "e"]);
    expect(done.map((row) => row.ticketId)).toEqual(["b", "c", "d"]);
  });
});

describe("chooseView", () => {
  const rows = requestRows([
    item({ ticketId: "a", change: change({ state: "quoted", coverage: "paid" }) }),
    item({ ticketId: "b", change: change({ state: "shipped", coverage: "free" }) }),
    item({ ticketId: "c", ticketStatus: "triaged" }),
  ]);

  it("shows the open requests and the first of them when the address says nothing", () => {
    const view = chooseView(rows, {});
    expect(view.filter).toBe("open");
    expect(view.listed.map((row) => row.ticketId)).toEqual(["a", "c"]);
    expect(view).toMatchObject({ selectedId: "a", explicit: false });
  });

  it("follows the filter in the address", () => {
    const view = chooseView(rows, { filter: "done" });
    expect(view.listed.map((row) => row.ticketId)).toEqual(["b"]);
    expect(view.selectedId).toBe("b");
    expect(chooseView(rows, { filter: "nonsense" }).filter).toBe("open");
  });

  it("opens the request the address names, in the list it belongs to, and says it was asked for", () => {
    expect(chooseView(rows, { open: "b" })).toMatchObject({ filter: "done", selectedId: "b", explicit: true });
    expect(chooseView(rows, { open: "c" })).toMatchObject({ filter: "open", selectedId: "c", explicit: true });
    expect(chooseView(rows, { open: "b", filter: "open" })).toMatchObject({ filter: "open", selectedId: "b" });
  });

  it("has nothing selected when there is nothing", () => {
    expect(chooseView([], {})).toEqual({ filter: "open", listed: [], selectedId: null, explicit: false });
  });
});

describe("includedHeaderLine", () => {
  it("says how many included edits are used, and says nothing when the plan has none", () => {
    expect(includedHeaderLine(1, 2)).toBe("This month: 1 of 2 included edits used.");
    expect(includedHeaderLine(0, 0)).toBeNull();
  });
});
