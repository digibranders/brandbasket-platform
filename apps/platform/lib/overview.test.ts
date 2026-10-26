import { describe, expect, it } from "vitest";
import { activityRows, greetingFor, monthKey, monthName, monthStart, resultLines, sublineFor, type SnapshotView } from "@/lib/overview";

const blank: SnapshotView = {
  adSpendCents: null,
  adBudgetCents: null,
  adEnquiries: null,
  postsPublished: null,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
};

describe("months in India", () => {
  it("names the month and the first of it by the Indian calendar", () => {
    expect(monthKey(new Date("2026-11-15T06:00:00.000Z"))).toBe("2026-11-01");
    expect(monthKey(new Date("2026-11-30T20:00:00.000Z"))).toBe("2026-12-01");
    expect(monthName(new Date("2026-11-15T06:00:00.000Z"))).toBe("November");
    expect(monthStart(new Date("2026-11-15T06:00:00.000Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
});

describe("greetingFor and sublineFor", () => {
  it("greets by the hour in India", () => {
    expect(greetingFor(new Date("2026-11-15T03:30:00.000Z"))).toBe("Good morning");
    expect(greetingFor(new Date("2026-11-15T08:30:00.000Z"))).toBe("Good afternoon");
    expect(greetingFor(new Date("2026-11-15T14:30:00.000Z"))).toBe("Good evening");
  });

  it("says how many things need the customer", () => {
    expect(sublineFor(0)).toBe("Everything is running. Nothing needs you.");
    expect(sublineFor(1)).toBe("Everything is running. 1 thing needs you.");
    expect(sublineFor(4)).toBe("Everything is running. 4 things need you.");
  });
});

describe("resultLines", () => {
  it("leaves out every line there is no data for", () => {
    expect(resultLines({ services: ["website", "social", "search"], chatbotLeads: 0, social: null, search: null })).toEqual([]);
    expect(resultLines({ services: ["social"], chatbotLeads: 0, social: blank, search: null })).toEqual([]);
  });

  it("counts chatbot leads for a website customer", () => {
    expect(resultLines({ services: ["website"], chatbotLeads: 14, social: null, search: null })).toEqual([
      { service: "website", figure: "14", headline: "people left their details with your chatbot", detail: null },
    ]);
    expect(resultLines({ services: ["website"], chatbotLeads: 1, social: null, search: null })[0]?.headline).toBe("person left their details with your chatbot");
  });

  it("does not show chatbot leads to a customer without the website", () => {
    expect(resultLines({ services: ["social"], chatbotLeads: 9, social: null, search: null })).toEqual([]);
  });

  it("writes the ads line with spend and posts", () => {
    const social = { ...blank, adEnquiries: 21, adSpendCents: 624000, adBudgetCents: 1000000, postsPublished: 12 };
    expect(resultLines({ services: ["social"], chatbotLeads: 0, social, search: null })).toEqual([
      { service: "social", figure: "21", headline: "enquiries came from your ads", detail: "₹6,240 spent of ₹10,000, 12 posts published" },
    ]);
  });

  it("falls back to posts when no enquiries were measured, and handles one", () => {
    expect(resultLines({ services: ["social"], chatbotLeads: 0, social: { ...blank, postsPublished: 1 }, search: null })).toEqual([
      { service: "social", figure: "1", headline: "post published", detail: null },
    ]);
    expect(resultLines({ services: ["social"], chatbotLeads: 0, social: { ...blank, adEnquiries: 1 }, search: null })[0]?.headline).toBe("enquiry came from your ads");
  });

  it("writes the search line with the change from last month", () => {
    const up = resultLines({ services: ["search"], chatbotLeads: 0, social: null, search: { ...blank, keywordsPageOne: 9, keywordsPageOnePrev: 6 } });
    expect(up).toEqual([{ service: "search", figure: "9", headline: "searches show you on Google's first page", detail: "Up from 6" }]);
    expect(resultLines({ services: ["search"], chatbotLeads: 0, social: null, search: { ...blank, keywordsPageOne: 4, keywordsPageOnePrev: 6 } })[0]?.detail).toBe("Down from 6");
    expect(resultLines({ services: ["search"], chatbotLeads: 0, social: null, search: { ...blank, keywordsPageOne: 6, keywordsPageOnePrev: 6 } })[0]?.detail).toBe("Same as last month");
    expect(resultLines({ services: ["search"], chatbotLeads: 0, social: null, search: { ...blank, keywordsPageOne: 6 } })[0]?.detail).toBeNull();
  });

  it("only shows a service the customer bought", () => {
    expect(resultLines({ services: ["website"], chatbotLeads: 0, social: { ...blank, adEnquiries: 5 }, search: { ...blank, keywordsPageOne: 3 } })).toEqual([]);
  });
});

describe("activityRows", () => {
  const events = [
    { id: "a", occurredAt: new Date("2026-11-24T06:00:00.000Z"), title: "Ads narrowed to 4 km around the clinic", service: "social" as const },
    { id: "b", occurredAt: new Date("2026-11-18T06:00:00.000Z"), title: "Clinic address fixed on Justdial", service: "search" as const },
  ];

  it("merges staff lines with the preview and launch dates, newest first", () => {
    const rows = activityRows({
      events,
      previewSentAt: new Date("2026-11-02T06:00:00.000Z"),
      launchedAt: new Date("2026-11-05T06:00:00.000Z"),
      hostname: "saidentalthane.in",
      limit: 10,
    });
    expect(rows.map((row) => row.label)).toEqual([
      "Ads narrowed to 4 km around the clinic",
      "Clinic address fixed on Justdial",
      "Your website went live on saidentalthane.in",
      "Your website preview was sent to you",
    ]);
    expect(rows[2]?.service).toBe("website");
  });

  it("puts events on the same instant in descending id order, as the database lists them", () => {
    const at = new Date("2026-11-24T06:00:00.000Z");
    const rows = activityRows({
      events: [
        { id: "a", occurredAt: at, title: "First line", service: null },
        { id: "b", occurredAt: at, title: "Second line", service: null },
      ],
      previewSentAt: null,
      launchedAt: null,
      hostname: null,
      limit: 5,
    });
    expect(rows.map((row) => row.label)).toEqual(["Second line", "First line"]);
  });

  it("limits the list and tolerates nothing to show", () => {
    expect(activityRows({ events, previewSentAt: null, launchedAt: null, hostname: null, limit: 1 })).toHaveLength(1);
    expect(activityRows({ events: [], previewSentAt: null, launchedAt: null, hostname: null, limit: 5 })).toEqual([]);
  });

  it("says it went live without an address when there is none", () => {
    const rows = activityRows({ events: [], previewSentAt: null, launchedAt: new Date("2026-11-05T06:00:00.000Z"), hostname: null, limit: 5 });
    expect(rows[0]?.label).toBe("Your website went live");
  });
});
