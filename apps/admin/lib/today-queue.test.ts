import { describe, expect, it } from "vitest";
import type { AttentionItem } from "./pipeline";
import { actionLabel, dueLabel, groupTodayQueue, todayQueue, todaySummary, type TodayInput, type TodayItem } from "./today-queue";

// 11:30 on Monday 30 November 2026 in India; the day ends at 18:30 UTC.
const NOW = new Date("2026-11-30T06:00:00.000Z");
const END_OF_TODAY = new Date("2026-11-30T18:30:00.000Z");

function attention(item: Partial<AttentionItem> & Pick<AttentionItem, "key" | "kind" | "at">): AttentionItem {
  return { subjectId: "subject", href: "/clients/subject", name: "Om Sweets", reason: "reason", ...item };
}

const EMPTY: TodayInput = { attention: [], newTickets: [], unpaidSignups: [], newErrors: [], failedDeliveries: null, endOfToday: END_OF_TODAY };

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
    expect(queue).toEqual([{ key: "deliveries:failed", kind: "delivery", href: "/deliveries", title: "3 deliveries failed", detail: "", dueAt: null }]);
  });

  it("says 1 delivery in the singular", () => {
    expect(todayQueue({ ...EMPTY, failedDeliveries: 1 })[0]?.title).toBe("1 delivery failed");
  });

  it("adds nothing when none failed or the count could not be read", () => {
    expect(todayQueue({ ...EMPTY, failedDeliveries: 0 })).toEqual([]);
    expect(todayQueue({ ...EMPTY, failedDeliveries: null })).toEqual([]);
  });
});

function item(key: string, dueAt: Date | null): TodayItem {
  return { key, kind: "payment", href: `/${key}`, title: key, detail: "", dueAt };
}

describe("groupTodayQueue", () => {
  // NOW is 11:30 India on 30 Nov; END_OF_TODAY is the start of 1 Dec in India.
  it("sorts items into Overdue, Due today and Waiting for someone, keeping each group's order", () => {
    const queue = [
      item("late-a", new Date("2026-11-28T06:00:00.000Z")),
      item("late-b", new Date("2026-11-30T03:00:00.000Z")),
      item("today-a", new Date("2026-11-30T07:00:00.000Z")),
      item("today-b", new Date("2026-11-30T12:30:00.000Z")),
      item("later", new Date("2026-12-02T06:00:00.000Z")),
      item("none", null),
    ];
    expect(groupTodayQueue(queue, NOW, END_OF_TODAY).map((group) => [group.heading, group.items.map((i) => i.key)])).toEqual([
      ["Overdue", ["late-a", "late-b"]],
      ["Due today", ["today-a", "today-b"]],
      ["Waiting for someone", ["later", "none"]],
    ]);
  });

  it("counts an item due exactly now as due today, not overdue", () => {
    const groups = groupTodayQueue([item("now", NOW)], NOW, END_OF_TODAY);
    expect(groups.map((group) => group.heading)).toEqual(["Due today"]);
  });

  it("counts an item due at the end of today as waiting", () => {
    const groups = groupTodayQueue([item("edge", END_OF_TODAY)], NOW, END_OF_TODAY);
    expect(groups.map((group) => group.heading)).toEqual(["Waiting for someone"]);
  });

  it("leaves out empty groups", () => {
    expect(groupTodayQueue([item("none", null)], NOW, END_OF_TODAY).map((group) => group.heading)).toEqual(["Waiting for someone"]);
    expect(groupTodayQueue([], NOW, END_OF_TODAY)).toEqual([]);
  });
});
