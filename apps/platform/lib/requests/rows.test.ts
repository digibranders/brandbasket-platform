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
    category: "support",
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

  it("puts the customer's turn (Quoted, Ready to check, Waiting for you) apart from ours", () => {
    const tones = (state: ChangeView["state"]) => requestRows([item({ change: change({ state, coverage: "free" }) })])[0]?.tone;
    expect(tones("quoted")).toBe("waiting");
    expect(tones("preview")).toBe("waiting");
    expect(tones("requested")).toBe("progress");
    expect(tones("in_progress")).toBe("progress");
    expect(tones("revisions")).toBe("progress");
    expect(tones("shipped")).toBe("done");
    expect(tones("declined")).toBe("closed");
  });

  it("gives a plain conversation the same words, and tells the customer when the team is waiting on them", () => {
    const rows = requestRows([
      item({ ticketStatus: "new" }),
      item({ ticketId: "t2", ticketStatus: "waiting_on_you", unread: true }),
      item({ ticketId: "t3", ticketStatus: "resolved" }),
    ]);
    expect(rows.map((row) => [row.word, row.tone, row.sub, row.unread])).toEqual([
      ["Sent", "progress", "Question · 27 Nov", false],
      ["Waiting for you", "waiting", "Question · 27 Nov", true],
      ["Done", "done", "Question · 27 Nov", false],
    ]);
  });

  it("shows Waiting for you on a change the team has asked about, but never on one that has ended", () => {
    const word = (state: ChangeView["state"]) => requestRows([item({ ticketStatus: "waiting_on_you", change: change({ state, coverage: "free" }) })])[0]?.word;
    expect(word("in_progress")).toBe("Waiting for you");
    expect(word("requested")).toBe("Waiting for you");
    expect(word("shipped")).toBe("Done");
    expect(word("declined")).toBe("Closed");
  });

  it("names a plain conversation by what it was filed under", () => {
    const sub = (category: RequestListItem["category"]) => requestRows([item({ category })])[0]?.sub;
    expect([sub("bug"), sub("general"), sub("billing"), sub("support")]).toEqual(["Not working · 27 Nov", "Information · 27 Nov", "Billing · 27 Nov", "Question · 27 Nov"]);
  });

  it("names each kind in the words of the form", () => {
    const sub = (kind: ChangeView["kind"]) => requestRows([item({ change: change({ kind }) })])[0]?.sub;
    expect([sub("social"), sub("search"), sub("billing"), sub("other")]).toEqual([
      "Social & Ads · 27 Nov",
      "Local SEO + AEO · 27 Nov",
      "Billing · 27 Nov",
      "Something else · 27 Nov",
    ]);
  });
});

describe("splitRows", () => {
  it("files the customer's turn as Waiting for you, what is going on with us as Open, and what is over as Done", () => {
    const rows = requestRows([
      item({ ticketId: "a", change: change({ state: "quoted", coverage: "paid" }) }),
      item({ ticketId: "b", change: change({ state: "shipped", coverage: "free" }) }),
      item({ ticketId: "c", change: change({ state: "withdrawn" }) }),
      item({ ticketId: "d", ticketStatus: "closed" }),
      item({ ticketId: "e", ticketStatus: "triaged" }),
      item({ ticketId: "f", ticketStatus: "waiting_on_you" }),
    ]);
    const { waiting, open, done } = splitRows(rows);
    expect(waiting.map((row) => row.ticketId)).toEqual(["a", "f"]);
    expect(open.map((row) => row.ticketId)).toEqual(["e"]);
    expect(done.map((row) => row.ticketId)).toEqual(["b", "c", "d"]);
  });
});

describe("chooseView", () => {
  const rows = requestRows([
    item({ ticketId: "a", change: change({ state: "quoted", coverage: "paid" }) }),
    item({ ticketId: "b", change: change({ state: "shipped", coverage: "free" }) }),
    item({ ticketId: "c", ticketStatus: "triaged" }),
  ]);

  it("opens on what is waiting for the customer, and the first of it, when the address says nothing", () => {
    const view = chooseView(rows, {});
    expect(view.filter).toBe("waiting");
    expect(view.listed.map((row) => row.ticketId)).toEqual(["a"]);
    expect(view).toMatchObject({ selectedId: "a", explicit: false });
  });

  it("opens on what is open when nothing is waiting", () => {
    const view = chooseView(rows.filter((row) => row.ticketId !== "a"), {});
    expect(view.filter).toBe("open");
    expect(view.listed.map((row) => row.ticketId)).toEqual(["c"]);
  });

  it("follows the filter in the address", () => {
    const view = chooseView(rows, { filter: "done" });
    expect(view.listed.map((row) => row.ticketId)).toEqual(["b"]);
    expect(view.selectedId).toBe("b");
    expect(chooseView(rows, { filter: "open" }).listed.map((row) => row.ticketId)).toEqual(["c"]);
    expect(chooseView(rows, { filter: "nonsense" }).filter).toBe("waiting");
  });

  it("opens the request the address names, in the list it belongs to, and says it was asked for", () => {
    expect(chooseView(rows, { open: "b" })).toMatchObject({ filter: "done", selectedId: "b", explicit: true });
    expect(chooseView(rows, { open: "c" })).toMatchObject({ filter: "open", selectedId: "c", explicit: true });
    expect(chooseView(rows, { open: "a" })).toMatchObject({ filter: "waiting", selectedId: "a" });
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
