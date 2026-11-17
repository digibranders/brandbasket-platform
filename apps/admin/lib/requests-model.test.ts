import { describe, expect, it } from "vitest";
import { changeChip, clockText, describeRequest, listHref, readClientQueue, threadBanner } from "./requests-model";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const ago = (hours: number, minutes = 0): Date => new Date(NOW.getTime() - (hours * 60 + minutes) * 60_000);
const base = { status: "new", lastStaffReplyAt: null, lastActivityAt: ago(1), change: null } as const;

describe("clockText", () => {
  it("words a clock in minutes, hours and minutes, or days and hours", () => {
    expect(clockText(12 * 60_000)).toBe("12m");
    expect(clockText((9 * 60 + 10) * 60_000)).toBe("9h 10m");
    expect(clockText((27 * 60) * 60_000)).toBe("1d 03h");
    expect(clockText(-5)).toBe("0m");
  });
});

describe("describeRequest", () => {
  it("is a Support request with a running clock, and Late from 24 hours", () => {
    const row = describeRequest({ ...base, lastCustomerMessageAt: ago(27) }, NOW);
    expect(row.type).toBe("support");
    expect(row.queue).toBe("needs_reply");
    expect(row.clock).toEqual({ text: "1d 03h", tone: "late", running: true });
    expect(row.chips.map((chip) => chip.label)).toEqual(["Support", "Late"]);
  });

  it("says Past 4 hours between 4 and 24 hours, and nothing under 4", () => {
    expect(describeRequest({ ...base, lastCustomerMessageAt: ago(9, 10) }, NOW).chips.map((chip) => chip.label)).toEqual(["Support", "Past 4 hours"]);
    expect(describeRequest({ ...base, lastCustomerMessageAt: ago(0, 12) }, NOW).chips.map((chip) => chip.label)).toEqual(["Support"]);
  });

  it("is a Change request when it has change details, with what it waits for", () => {
    const change = { state: "requested", coverage: "undecided", accepted: false, paid: false } as const;
    const row = describeRequest({ ...base, lastCustomerMessageAt: ago(9), change }, NOW);
    expect(row.type).toBe("change");
    expect(row.chips.map((chip) => chip.label)).toEqual(["Change", "Needs a quote", "Past 4 hours"]);
  });

  it("gives a paid request that has started its own chip, even though the customer is the last to write", () => {
    expect(changeChip({ state: "in_progress", coverage: "paid", accepted: true, paid: true })).toEqual({ label: "Paid, in progress", variant: "active" });
    const row = describeRequest({ ...base, lastCustomerMessageAt: ago(40), lastStaffReplyAt: ago(48), change: { state: "in_progress", coverage: "paid", accepted: true, paid: true } }, NOW);
    expect(row.queue).toBe("needs_reply");
    expect(row.chips.map((chip) => chip.label)).toContain("Paid, in progress");
  });

  it("waits on the customer after a staff reply, with a quiet clock since the last activity", () => {
    const row = describeRequest({ ...base, lastCustomerMessageAt: ago(30), lastStaffReplyAt: ago(26), lastActivityAt: ago(26) }, NOW);
    expect(row.queue).toBe("waiting_on_client");
    expect(row.clock).toEqual({ text: "1d 02h", tone: "ok", running: false });
    expect(row.chips.map((chip) => chip.label)).toEqual(["Support"]);
  });

  it("is Closed, with no clock, once resolved or closed", () => {
    const row = describeRequest({ ...base, status: "resolved", lastCustomerMessageAt: ago(30) }, NOW);
    expect(row.clock).toBeNull();
    expect(row.chips.map((chip) => chip.label)).toEqual(["Support", "Closed"]);
  });
});

describe("threadBanner", () => {
  it("follows the last message: waiting on you after the customer writes, on the customer after a reply", () => {
    const afterCustomer = threadBanner({ status: "new", lastCustomerMessageAt: ago(27), lastStaffReplyAt: ago(40) }, NOW);
    expect(afterCustomer).toEqual({ tone: "late", text: "Waiting on you", clock: "1d 03h", note: "The 4 hour promise was missed." });
    const afterReply = threadBanner({ status: "new", lastCustomerMessageAt: ago(27), lastStaffReplyAt: ago(1) }, NOW);
    expect(afterReply.text).toBe("Waiting on the customer");
    expect(afterReply.clock).toBeNull();
  });

  it("says nothing is waiting on a finished request", () => {
    expect(threadBanner({ status: "closed", lastCustomerMessageAt: ago(3), lastStaffReplyAt: null }, NOW)).toMatchObject({ tone: "ok", text: "Closed. Nothing is waiting." });
  });
});

describe("listHref", () => {
  it("leaves out whatever is the default, and keeps the rest", () => {
    expect(listHref("/support", "needs_reply", { queue: "needs_reply" })).toBe("/support");
    expect(listHref("/support", "needs_reply", { queue: "done", search: "logo", category: "billing", open: "t1" })).toBe("/support?queue=done&category=billing&search=logo&open=t1");
    expect(listHref("/clients/b1/requests", "all", { queue: "all", open: null })).toBe("/clients/b1/requests");
  });
});

describe("readClientQueue", () => {
  it("accepts the three queues and treats anything else as all", () => {
    expect(readClientQueue("done")).toBe("done");
    expect(readClientQueue(["needs_reply"])).toBe("needs_reply");
    expect(readClientQueue("nonsense")).toBe("all");
    expect(readClientQueue(undefined)).toBe("all");
  });
});
