import { describe, expect, it } from "vitest";
import { chargeSummary, keepPlanSummary, quoteSummary, reactivationSummary, unlockPostsSummary } from "./payment-summaries";

const SERVICES = [
  { key: "managed-website", title: "Website Management", netCents: 299_900 },
  { key: "social-media", title: "Social Media Management", netCents: 299_900 },
];

describe("chargeSummary", () => {
  it("shows the charge's label and amount, due today, as a one-off payment", () => {
    expect(chargeSummary("Extra page: Gallery", "₹1,500", "INR")).toEqual({
      title: "Pay this charge",
      rows: [{ key: "charge", label: "Extra page: Gallery", amount: "₹1,500", tone: "plain" }],
      totalLabel: "Due today",
      total: "₹1,500",
      notes: ["A one-off payment.", "All prices include GST."],
    });
  });

  it("leaves the GST note out of a charge that carries no tax, and keeps it when it does", () => {
    expect(chargeSummary("Extra page", "₹1,000", "INR", 0).notes).toEqual(["A one-off payment."]);
    expect(chargeSummary("Extra page", "₹1,000", "INR", 1_800).notes).toEqual(["A one-off payment.", "All prices include GST."]);
  });

  it("leaves GST out of a dollar charge", () => {
    expect(chargeSummary("Extra page", "$20", "USD").notes).toEqual(["A one-off payment."]);
  });
});

describe("unlockPostsSummary", () => {
  it("names the posts, the price and when they unlock", () => {
    expect(unlockPostsSummary({ posts: 100, price: "₹560.50", currency: "INR" })).toEqual({
      title: "Unlock more posts",
      rows: [{ key: "posts", label: "100 more blog posts", amount: "₹560.50", tone: "plain" }],
      totalLabel: "Due today",
      total: "₹560.50",
      notes: ["A one-off payment. The posts unlock as soon as it is confirmed.", "All prices include GST."],
    });
  });

  it("says one post in the singular", () => {
    expect(unlockPostsSummary({ posts: 1, price: "$5", currency: "USD" }).rows[0]?.label).toBe("1 more blog post");
  });
});

describe("quoteSummary", () => {
  it("shows the quote's line and total", () => {
    expect(quoteSummary({ line: "2 hours at ₹950", total: "₹2,242" })).toEqual({
      title: "Pay for this change",
      rows: [{ key: "quote", label: "2 hours at ₹950", amount: "₹2,242", tone: "plain" }],
      totalLabel: "Due today",
      total: "₹2,242",
      notes: [],
    });
  });

  it("carries the GST note it is given", () => {
    expect(quoteSummary({ line: "a", total: "b" }, ["All prices include GST."]).notes).toEqual(["All prices include GST."]);
  });
});

describe("reactivationSummary", () => {
  const facts = { services: SERVICES, discountCents: 0, total: "₹5,998", currency: "INR", interval: "month", renewsOn: "Sun 13 Dec" } as const;

  it("lists each service at its monthly price and when it renews", () => {
    const summary = reactivationSummary(facts);
    expect(summary.title).toBe("Reactivate your plan");
    expect(summary.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Website Management", "₹2,999"],
      ["Social Media Management", "₹2,999"],
    ]);
    expect(summary.totalLabel).toBe("Due today");
    expect(summary.total).toBe("₹5,998");
    expect(summary.notes).toEqual(["It renews a month from Sun 13 Dec.", "All prices include GST."]);
  });

  it("takes the code off as a negative row, and says a year for a yearly plan", () => {
    const summary = reactivationSummary({ ...facts, discountCents: 50_000, interval: "year" });
    expect(summary.rows.at(-1)).toEqual({ key: "code", label: "Your code", amount: "-₹500", tone: "save" });
    expect(summary.notes[0]).toBe("It renews a year from Sun 13 Dec.");
  });
});

describe("keepPlanSummary", () => {
  const facts = { services: SERVICES, discountCents: 0, total: "₹5,998", currency: "INR", interval: "month", firstPaymentOn: "Thu 19 Nov" } as const;

  it("says nothing is taken today and when the first payment falls", () => {
    const summary = keepPlanSummary(facts);
    expect(summary.title).toBe("Keep your plan");
    expect(summary.totalLabel).toBe("First payment on Thu 19 Nov");
    expect(summary.total).toBe("₹5,998");
    expect(summary.notes).toEqual(["Nothing is taken today.", "Then it renews a month.", "All prices include GST."]);
  });

  it("shows the code only when there is a discount", () => {
    expect(keepPlanSummary(facts).rows.some((row) => row.key === "code")).toBe(false);
    expect(keepPlanSummary({ ...facts, discountCents: 1_000 }).rows.at(-1)?.label).toBe("Your code");
  });

  it("says a year for a yearly plan and leaves GST off a dollar one", () => {
    expect(keepPlanSummary({ ...facts, interval: "year", currency: "USD" }).notes).toEqual(["Nothing is taken today.", "Then it renews a year."]);
  });
});
