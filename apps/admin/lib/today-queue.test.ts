import { describe, expect, it } from "vitest";
import type { AttentionItem } from "./pipeline";
import { actionLabel, clientIdOf, dueLabel, filtersFailedBy, groupTodayQueue, matchesTodayFilter, NEXT_STEPS, rowClock, todayFilterCounts, todayQueue, todaySummary, type TodayInput, type TodayItem, type TodayKind } from "./today-queue";

// 11:30 on Monday 30 November 2026 in India; the day ends at 18:30 UTC.
const NOW = new Date("2026-11-30T06:00:00.000Z");
const END_OF_TODAY = new Date("2026-11-30T18:30:00.000Z");

function attention(item: Partial<AttentionItem> & Pick<AttentionItem, "key" | "kind" | "at">): AttentionItem {
  return { subjectId: "subject", href: "/clients/subject", name: "Om Sweets", reason: "reason", ...item };
}

const EMPTY: TodayInput = { attention: [], newTickets: [], unpaidSignups: [], newErrors: [], failedDeliveries: null, kickoffsNeedingOutcome: null, endOfToday: END_OF_TODAY };

describe("todayQueue", () => {
  it("puts the latest first, then what is due soonest, with every kind", () => {
    const queue = todayQueue({
      attention: [
        attention({ key: "overdue:om", kind: "overdue", at: new Date("2026-11-28T12:30:00.000Z"), name: "Om Sweets" }),
        attention({ key: "due:fitzone", kind: "due", at: new Date("2026-11-30T12:30:00.000Z"), name: "FitZone Gym" }),
        attention({ key: "lead:green", kind: "new-lead", at: new Date("2026-11-30T03:00:00.000Z"), name: "Green Leaf Cafe", href: "/leads/green" }),
      ],
      newTickets: [{ id: "ticket-1", subject: "Change the opening hours", displayRef: "R-0152", category: "website_change", createdAt: new Date("2026-11-29T04:00:00.000Z") }],
      unpaidSignups: [{ id: "lead-kumar", businessName: "Kumar Opticals", createdAt: new Date("2026-11-29T00:00:00.000Z") }],
      newErrors: [],
      failedDeliveries: null,
      kickoffsNeedingOutcome: null,
      endOfToday: END_OF_TODAY,
    });
    expect(queue.map((item) => item.key)).toEqual(["overdue:om", "request:ticket-1", "lead:green", "due:fitzone", "signup:lead-kumar"]);
  });

  it("leaves out previews due after today", () => {
    const queue = todayQueue({ ...EMPTY, attention: [attention({ key: "due:later", kind: "due", at: new Date("2026-12-01T06:00:00.000Z") })] });
    expect(queue).toEqual([]);
  });

  it("writes each kind's title, detail, link and due time", () => {
    const queue = todayQueue({
      ...EMPTY,
      attention: [
        attention({ key: "payment:p1", kind: "payment", at: new Date("2026-11-30T05:00:00.000Z"), name: "Shree Auto Works", href: "/clients/shree" }),
        attention({ key: "add-on:bundled:a1", kind: "add-on", at: new Date("2026-11-30T05:00:00.000Z"), name: "Kavya Salon", reason: "New add-on to set up: Social Media and Ads" }),
      ],
      newErrors: [{ id: "error-1", operation: "checkout.submit", route: "/billing/pay", occurrenceCount: 3, firstSeenAt: new Date("2026-11-30T02:00:00.000Z") }],
    });
    expect(queue).toEqual([
      { key: "error:error-1", kind: "error", href: "/support/errors/error-1", title: "New error: checkout.submit", detail: "/billing/pay · 3 times", dueAt: new Date("2026-12-01T02:00:00.000Z") },
      { key: "payment:p1", kind: "payment", href: "/clients/shree", title: "Payment needs a look: Shree Auto Works", detail: "Raised 30 Nov", dueAt: new Date("2026-12-01T05:00:00.000Z") },
      { key: "add-on:bundled:a1", kind: "add-on", href: "/clients/subject", title: "Add-on to start: Kavya Salon", detail: "New add-on to set up: Social Media and Ads", dueAt: new Date("2026-12-01T05:00:00.000Z") },
    ]);
  });

  it("names requests, sign-ups and new enquiries in plain words", () => {
    const queue = todayQueue({
      ...EMPTY,
      attention: [attention({ key: "lead:green", kind: "new-lead", at: new Date("2026-11-30T03:00:00.000Z"), name: "Green Leaf Cafe", href: "/leads/green" })],
      newTickets: [{ id: "ticket-1", subject: "Change the opening hours", displayRef: "R-0152", category: "website_change", createdAt: new Date("2026-11-29T04:00:00.000Z") }],
      unpaidSignups: [{ id: "lead-kumar", businessName: "Kumar Opticals", createdAt: new Date("2026-11-29T00:00:00.000Z") }],
    });
    expect(queue.map((item) => [item.title, item.detail, item.href])).toEqual([
      ['No reply yet: "Change the opening hours"', "R-0152 · Website change", "/support/ticket-1"],
      ["New enquiry: Green Leaf Cafe", "Arrived 30 Nov at 08:30", "/leads/green"],
      ["Signed up, not paid: Kumar Opticals", "Signed up 29 Nov", "/leads/lead-kumar"],
    ]);
  });

  it("shows the owner on unpaid sign-up rows when assigned (D21)", () => {
    const queue = todayQueue({
      ...EMPTY,
      unpaidSignups: [
        { id: "lead-1", businessName: "Kumar Opticals", createdAt: new Date("2026-11-29T00:00:00.000Z"), ownerName: "Rohan Mehta" },
        { id: "lead-2", businessName: "Om Sweets", createdAt: new Date("2026-11-29T00:00:00.000Z"), ownerName: null },
      ],
    });
    expect(queue.map((item) => [item.title, item.detail])).toEqual([
      ["Signed up, not paid: Kumar Opticals", "Signed up 29 Nov · Rohan Mehta"],
      ["Signed up, not paid: Om Sweets", "Signed up 29 Nov"],
    ]);
  });

  it("adds approved previews with launch action and links to the client website page", () => {
    const queue = todayQueue({
      ...EMPTY,
      approvedPreviews: [
        { businessId: "biz-1", businessName: "Harbour Bakery", dueAt: new Date("2026-12-01T12:00:00.000Z") },
      ],
    });
    expect(queue).toEqual([
      {
        key: "approved:biz-1",
        kind: "approved",
        href: "/clients/biz-1/website",
        title: "Website approved: Harbour Bakery",
        detail: "Ready to launch",
        dueAt: new Date("2026-12-01T12:00:00.000Z"),
        action: "Launch",
      },
    ]);
  });

  it("adds domain moves with due date based on wait limit", () => {
    const queue = todayQueue({
      ...EMPTY,
      domainMoves: [
        {
          id: "dom-1",
          businessId: "biz-1",
          businessName: "Harbour Bakery",
          hostname: "harbourbakery.com",
          status: "pending",
          createdAt: new Date("2026-11-29T10:00:00.000Z"),
        },
      ],
    });
    expect(queue).toEqual([
      {
        key: "domain:dom-1",
        kind: "domain",
        href: "/clients/biz-1/website",
        title: "Domain move: Harbour Bakery",
        detail: "harbourbakery.com · pending",
        dueAt: new Date("2026-11-30T10:00:00.000Z"),
      },
    ]);
  });

  it("lists builds started without call confirmation with the expected label", () => {
    const queue = todayQueue({
      ...EMPTY,
      unconfirmedStarts: [
        { businessId: "biz-1", businessName: "Auto Start Cafe", startedAt: new Date("2026-11-29T10:00:00.000Z") },
      ],
    });
    expect(queue).toEqual([
      {
        key: "unconfirmed_start:biz-1",
        kind: "unconfirmed_start",
        href: "/clients/biz-1/website",
        title: "Started without call confirmation",
        detail: "Auto Start Cafe",
        dueAt: null,
      },
    ]);
  });
});

describe("dueLabel", () => {
  it("says how late, or when it is due", () => {
    expect(dueLabel(new Date("2026-11-28T06:00:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "2 days late", tone: "late" });
    expect(dueLabel(new Date("2026-11-29T05:00:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "1 day late", tone: "late" });
    expect(dueLabel(new Date("2026-11-30T03:30:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "2h late", tone: "late" });
    expect(dueLabel(new Date("2026-11-30T05:50:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "1h late", tone: "late" });
    expect(dueLabel(new Date("2026-11-30T12:30:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "by 18:00", tone: "soon" });
    expect(dueLabel(new Date("2026-12-02T06:00:00.000Z"), NOW, END_OF_TODAY)).toEqual({ text: "due 2 Dec", tone: "plain" });
    expect(dueLabel(null, NOW, END_OF_TODAY)).toEqual({ text: "", tone: "plain" });
  });
});

describe("actionLabel", () => {
  it("names the button for what it does", () => {
    expect(actionLabel("payment")).toBe("Check");
    expect(actionLabel("request")).toBe("Reply");
    expect(actionLabel("overdue")).toBe("Open");
    expect(actionLabel("approved")).toBe("Launch");
    expect(actionLabel("domain")).toBe("Open");
  });
});

describe("todaySummary", () => {
  it("counts the work and the late work", () => {
    expect(todaySummary(NOW, 9, 2)).toBe("Monday 30 November. 9 things need someone today, 2 are late.");
    expect(todaySummary(NOW, 1, 1)).toBe("Monday 30 November. 1 thing needs someone today, 1 is late.");
    expect(todaySummary(NOW, 3, 0)).toBe("Monday 30 November. 3 things need someone today.");
    expect(todaySummary(NOW, 0, 0)).toBe("Monday 30 November. Nothing needs anyone right now.");
  });

  it("does not say all clear when a list failed to load", () => {
    expect(todaySummary(NOW, 0, 0, true)).toBe("Monday 30 November.");
    expect(todaySummary(NOW, 2, 0, true)).toBe("Monday 30 November. 2 things need someone today.");
  });
});

describe("failed deliveries", () => {
  it("adds one item that links to the deliveries page", () => {
    const queue = todayQueue({ ...EMPTY, failedDeliveries: 3 });
    expect(queue).toEqual([{ key: "deliveries:failed", kind: "delivery", href: "/deliveries", title: "3 emails and webhooks failed", detail: "", dueAt: null }]);
  });

  it("keeps the same wording for a single failure", () => {
    expect(todayQueue({ ...EMPTY, failedDeliveries: 1 })[0]?.title).toBe("1 email or webhook failed");
  });

  it("adds nothing when none failed or the count could not be read", () => {
    expect(todayQueue({ ...EMPTY, failedDeliveries: 0 })).toEqual([]);
    expect(todayQueue({ ...EMPTY, failedDeliveries: null })).toEqual([]);
  });
});

describe("kickoff calls needing an outcome", () => {
  const EARLY = { businessId: "b-early", businessName: "Green Leaf Cafe", endsAt: new Date("2026-11-29T05:00:00.000Z") };
  const LATE = { businessId: "b-late", businessName: "Kestrel Bakery", endsAt: new Date("2026-11-30T05:00:00.000Z") };

  it("adds one item per business that links to the Calls page, due when its call ended", () => {
    const queue = todayQueue({ ...EMPTY, kickoffsNeedingOutcome: [LATE, EARLY] });
    expect(queue).toEqual([
      { key: "kickoff:b-early", kind: "kickoff", href: "/", title: "Did the kickoff happen?", detail: "Green Leaf Cafe · ended 29 Nov, 10:30", dueAt: EARLY.endsAt },
      { key: "kickoff:b-late", kind: "kickoff", href: "/", title: "Did the kickoff happen?", detail: "Kestrel Bakery · ended 30 Nov, 10:30", dueAt: LATE.endsAt },
    ]);
  });

  it("is overdue, so it groups under Late", () => {
    const queue = todayQueue({ ...EMPTY, kickoffsNeedingOutcome: [LATE] });
    expect(groupTodayQueue(queue, NOW, END_OF_TODAY).map((group) => group.heading)).toEqual(["Late"]);
  });

  it("is gone once the call is marked: a business no longer in the list has no item", () => {
    expect(todayQueue({ ...EMPTY, kickoffsNeedingOutcome: [EARLY, LATE] }).map((entry) => entry.key)).toEqual(["kickoff:b-early", "kickoff:b-late"]);
    expect(todayQueue({ ...EMPTY, kickoffsNeedingOutcome: [LATE] }).map((entry) => entry.key)).toEqual(["kickoff:b-late"]);
  });

  it("adds nothing at zero or when the read failed", () => {
    expect(todayQueue({ ...EMPTY, kickoffsNeedingOutcome: [] })).toEqual([]);
    expect(todayQueue({ ...EMPTY, kickoffsNeedingOutcome: null })).toEqual([]);
  });
});

function item(key: string, dueAt: Date | null): TodayItem {
  return { key, kind: "payment", href: `/${key}`, title: key, detail: "", dueAt };
}

describe("groupTodayQueue", () => {
  // NOW is 11:30 India on 30 Nov; END_OF_TODAY is the start of 1 Dec in India.
  it("sorts items into Late, Due today and Upcoming, keeping each group's order", () => {
    const queue = [
      item("late-a", new Date("2026-11-28T06:00:00.000Z")),
      item("late-b", new Date("2026-11-30T03:00:00.000Z")),
      item("today-a", new Date("2026-11-30T07:00:00.000Z")),
      item("today-b", new Date("2026-11-30T12:30:00.000Z")),
      item("later", new Date("2026-12-02T06:00:00.000Z")),
      item("none", null),
    ];
    expect(groupTodayQueue(queue, NOW, END_OF_TODAY).map((group) => [group.heading, group.items.map((i) => i.key)])).toEqual([
      ["Late", ["late-a", "late-b"]],
      ["Due today", ["today-a", "today-b"]],
      ["Upcoming", ["later", "none"]],
    ]);
  });

  it("counts an item due exactly now as due today, not overdue", () => {
    const groups = groupTodayQueue([item("now", NOW)], NOW, END_OF_TODAY);
    expect(groups.map((group) => group.heading)).toEqual(["Due today"]);
  });

  it("counts an item due at the end of today as upcoming", () => {
    const groups = groupTodayQueue([item("edge", END_OF_TODAY)], NOW, END_OF_TODAY);
    expect(groups.map((group) => group.heading)).toEqual(["Upcoming"]);
  });

  it("leaves out empty groups", () => {
    expect(groupTodayQueue([item("none", null)], NOW, END_OF_TODAY).map((group) => group.heading)).toEqual(["Upcoming"]);
    expect(groupTodayQueue([], NOW, END_OF_TODAY)).toEqual([]);
  });
});

describe("Google items", () => {
  const google = (key: string, dueAt: Date | null, action = "Open client"): TodayItem => ({ key, kind: "google", href: "/x", title: key, detail: "", action, dueAt });
  const INPUT: TodayInput = { attention: [], newTickets: [], unpaidSignups: [], newErrors: [], failedDeliveries: null, kickoffsNeedingOutcome: null, endOfToday: END_OF_TODAY };

  it("joins the queue, so the count follows, and sorts with the rest by due time", () => {
    const early = google("google:a", new Date(NOW.getTime() - 3_600_000));
    const late = google("google:b", new Date(NOW.getTime() - 7_200_000));
    expect(todayQueue({ ...INPUT, google: [early, late] }).map((item) => item.key)).toEqual(["google:b", "google:a"]);
    expect(todayQueue(INPUT)).toEqual([]);
  });

  it("groups by its clock like any row, with no Google section of its own", () => {
    const overdue = google("google:a", new Date(NOW.getTime() - 3_600_000));
    const other: TodayItem = { key: "request:1", kind: "request", href: "/support/1", title: "r", detail: "", dueAt: new Date(NOW.getTime() - 60_000) };
    const groups = groupTodayQueue([overdue, other], NOW, END_OF_TODAY);
    expect(groups.map((group) => [group.heading, group.items.map((item) => item.key)])).toEqual([["Late", ["google:a", "request:1"]]]);
  });

  it("leaves no groups when there are no rows", () => {
    expect(groupTodayQueue([], NOW, END_OF_TODAY)).toEqual([]);
  });
});

describe("the compliance, report and silent-preview rows", () => {
  const INPUT: TodayInput = { attention: [], newTickets: [], unpaidSignups: [], newErrors: [], failedDeliveries: null, kickoffsNeedingOutcome: null, endOfToday: END_OF_TODAY };

  it("builds a privacy request row on its own due date with the request clock", () => {
    const dueAt = new Date("2026-12-20T06:00:00.000Z");
    const [row] = todayQueue({ ...INPUT, privacyRequests: [{ id: "p1", reference: "PR-1", kindLabel: "Access to my data", dueAt }] });
    expect(row).toEqual({ key: "privacy:p1", kind: "privacy", href: "/privacy-requests", title: "Privacy request PR-1", detail: "Access to my data", dueAt, clock: "request" });
    expect(rowClock(row as TodayItem, NOW, END_OF_TODAY)).toEqual({ text: "20d 00h remaining", tone: "plain" });
    expect(rowClock({ ...(row as TodayItem), dueAt: new Date("2026-11-28T06:00:00.000Z") }, NOW, END_OF_TODAY)).toEqual({ text: "02d 00h overdue", tone: "late" });
  });

  it("builds a breach row on the next report's deadline with the breach clock, and shortens a long summary", () => {
    const deadline = new Date("2026-11-30T11:12:00.000Z");
    const [row] = todayQueue({ ...INPUT, breaches: [{ id: "b1", summary: "x".repeat(100), duty: "CERT-In", deadline }] });
    expect(row).toMatchObject({ key: "breach:b1", kind: "breach", href: "/breaches", title: "Breach report due: CERT-In", dueAt: deadline, clock: "breach" });
    expect(row?.detail).toBe(`${"x".repeat(80)}...`);
    expect(rowClock(row as TodayItem, NOW, END_OF_TODAY)).toEqual({ text: "5h 12m left", tone: "plain" });
  });

  it("builds a closure row on the erase date", () => {
    const eraseAfter = new Date("2026-12-02T00:00:00.000Z");
    const [row] = todayQueue({ ...INPUT, closures: [{ businessId: "biz-1", businessName: "Asha Cafe", eraseAfter }] });
    expect(row).toEqual({ key: "closure:biz-1", kind: "closure", href: "/clients/biz-1", title: "Account closing: Asha Cafe", detail: "Erased after 2 Dec", dueAt: eraseAfter });
  });

  it("builds one report row, singular or plural, and none when null", () => {
    const dueAt = new Date("2026-12-05T18:30:00.000Z");
    expect(todayQueue({ ...INPUT, reportsToReview: { count: 1, dueAt } })[0]).toEqual({ key: "reports:review", kind: "report", href: "/reports", title: "1 report to review", detail: "Review by the 5th", dueAt });
    expect(todayQueue({ ...INPUT, reportsToReview: { count: 4, dueAt } })[0]?.title).toBe("4 reports to review");
    expect(todayQueue({ ...INPUT, reportsToReview: null })).toEqual([]);
  });

  it("builds a silent preview row with no clock", () => {
    const [row] = todayQueue({ ...INPUT, silentPreviews: [{ businessId: "biz-2", businessName: "Kumar Opticals", sentAt: new Date("2026-11-24T06:00:00.000Z"), days: 6 }] });
    expect(row).toEqual({ key: "preview_silent:biz-2", kind: "preview_silent", href: "/clients/biz-2/website", title: "Preview sent, no answer: Kumar Opticals", detail: "Sent 24 Nov, 6 days ago", dueAt: null });
  });

  it("gives each new kind its verb, next step and client", () => {
    expect(actionLabel("kickoff")).toBe("Call completed");
    expect(actionLabel("report")).toBe("Review");
    for (const kind of ["privacy", "breach", "closure", "preview_silent"] as const) expect(actionLabel(kind)).toBe("Open");
    for (const kind of Object.keys(NEXT_STEPS) as TodayKind[]) expect(NEXT_STEPS[kind]).not.toBe("");
    expect(clientIdOf({ key: "kickoff:biz-9", kind: "kickoff", href: "/", title: "", detail: "", dueAt: null })).toBe("biz-9");
    expect(clientIdOf({ key: "closure:biz-1", kind: "closure", href: "/clients/biz-1", title: "", detail: "", dueAt: null })).toBe("biz-1");
    expect(clientIdOf({ key: "privacy:p1", kind: "privacy", href: "/privacy-requests", title: "", detail: "", dueAt: null })).toBeNull();
  });
});

describe("the four groups", () => {
  const row = (key: string, kind: TodayKind, dueAt: Date | null): TodayItem => ({ key, kind, href: `/${key}`, title: key, detail: "", dueAt });

  it("puts a late customer wait under Late but an unexpired one, and a silent preview, under Waiting on someone", () => {
    const queue = [
      row("late-signup", "signup", new Date("2026-11-29T06:00:00.000Z")),
      row("signup", "signup", new Date("2026-12-01T06:00:00.000Z")),
      row("silent", "preview_silent", null),
      row("today", "request", new Date("2026-11-30T12:30:00.000Z")),
      row("later", "report", new Date("2026-12-05T06:00:00.000Z")),
    ];
    expect(groupTodayQueue(queue, NOW, END_OF_TODAY).map((group) => [group.heading, group.items.map((i) => i.key)])).toEqual([
      ["Late", ["late-signup"]],
      ["Due today", ["today"]],
      ["Waiting on someone", ["signup", "silent"]],
      ["Upcoming", ["later"]],
    ]);
  });
});

describe("the filters", () => {
  const row = (key: string, kind: TodayKind, dueAt: Date | null): TodayItem => ({ key, kind, href: `/${key}`, title: key, detail: "", dueAt });
  const LATE = new Date("2026-11-29T06:00:00.000Z");
  const items = [
    row("k", "kickoff", LATE),
    row("g", "google", null),
    row("r", "request", null),
    row("rep", "report", null),
    row("p", "payment", LATE),
    row("e", "new-lead", null),
    row("s", "signup", null),
    row("pr", "privacy", null),
    row("br", "breach", null),
    row("cl", "closure", null),
    row("d", "delivery", null),
  ];

  it("files kickoff under Builds, Google under System, reports and requests under Customers, sign-ups under Enquiries", () => {
    const keys = (filter: Parameters<typeof matchesTodayFilter>[1]): string[] => items.filter((item) => matchesTodayFilter(item, filter, NOW)).map((item) => item.key);
    expect(keys("builds")).toEqual(["k"]);
    expect(keys("system")).toEqual(["g", "d"]);
    expect(keys("customers")).toEqual(["r", "rep"]);
    expect(keys("enquiries")).toEqual(["e", "s"]);
    expect(keys("money")).toEqual(["p"]);
    expect(keys("compliance")).toEqual(["pr", "br", "cl"]);
    expect(keys("late")).toEqual(["k", "p"]);
    expect(keys("all")).toHaveLength(items.length);
  });

  it("counts each chip and has no Calls chip", () => {
    expect(todayFilterCounts(items, NOW)).toEqual({ all: 11, late: 2, customers: 2, builds: 1, money: 1, enquiries: 2, compliance: 3, system: 2 });
    expect(Object.keys(todayFilterCounts(items, NOW))).not.toContain("calls");
  });

  it("marks the chips behind a failed source as unread", () => {
    expect([...filtersFailedBy(["breaches", "deliveries", "calls", "Google"])].sort()).toEqual(["compliance", "system"]);
    expect([...filtersFailedBy(["clients"])].sort()).toEqual(["builds", "compliance", "money"]);
    expect(filtersFailedBy([])).toEqual([]);
  });
});
