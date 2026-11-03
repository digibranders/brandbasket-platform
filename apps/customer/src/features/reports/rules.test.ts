import { describe, expect, it } from "vitest";
import { groupSentByMonth, highlightsOf, isReportService, monthKeyOfDocument, monthTitle, parseMonthParam, readContent, type SentReport } from "./rules";

const CONTENT = { headline: "Your website was online 99.96% of the month.", figures: [{ label: "Visits", value: "3,184" }], whatWeDid: ["Published a blog post"] };

function report(over: Partial<SentReport> = {}): SentReport {
  return { id: "r1", service: "website", month: "2026-10-01", state: "sent", content: CONTENT, contentVersion: 1, pdfKey: null, sentAt: new Date("2026-11-03T04:00:00Z"), ...over };
}

describe("month parsing", () => {
  it("accepts a real month and refuses everything else", () => {
    expect(parseMonthParam("2026-10")).toBe("2026-10");
    for (const bad of ["2026-13", "2026-00", "2026-1", "2026-10-01", "october", "", "../2026-10"]) expect(parseMonthParam(bad)).toBeNull();
  });

  it("reads a stored month only when it is the first of a month", () => {
    expect(monthKeyOfDocument("2026-10-01")).toBe("2026-10");
    expect(monthKeyOfDocument("2026-10-02")).toBeNull();
    expect(monthKeyOfDocument("2026-13-01")).toBeNull();
  });

  it("names a month in words", () => {
    expect(monthTitle("2026-10")).toBe("October 2026");
  });

  it("knows the three services and nothing else", () => {
    expect(["website", "social", "search"].every(isReportService)).toBe(true);
    expect(isReportService("ads")).toBe(false);
    expect(isReportService(null)).toBe(false);
  });
});

describe("which months show", () => {
  it("lists only months with a sent report, newest first", () => {
    const months = groupSentByMonth([report({ id: "a", month: "2026-09-01" }), report({ id: "b", month: "2026-10-01" })]);
    expect(months.map((month) => month.key)).toEqual(["2026-10", "2026-09"]);
  });

  it("never lists a month whose reports are not sent, even if one reaches it", () => {
    for (const state of ["draft", "held", "approved"] as const) expect(groupSentByMonth([report({ state, sentAt: null })])).toEqual([]);
    expect(groupSentByMonth([report({ sentAt: null })])).toEqual([]);
  });

  it("drops a document whose month is not a month", () => {
    expect(groupSentByMonth([report({ month: "2026-10-15" })])).toEqual([]);
  });

  it("puts a month's reports in catalogue order and dates the month by the last one sent", () => {
    const [month] = groupSentByMonth([
      report({ id: "s", service: "search", sentAt: new Date("2026-11-05T04:00:00Z") }),
      report({ id: "w", service: "website", sentAt: new Date("2026-11-03T04:00:00Z") }),
      report({ id: "o", service: "social", sentAt: new Date("2026-11-04T04:00:00Z") }),
    ]);
    expect(month?.reports.map((item) => item.service)).toEqual(["website", "social", "search"]);
    expect(month?.sentAt).toEqual(new Date("2026-11-05T04:00:00Z"));
  });

  it("shows a month for the services that were sent, not for ones that were not", () => {
    const [month] = groupSentByMonth([report({ service: "social" })]);
    expect(month?.reports.map((item) => item.service)).toEqual(["social"]);
  });
});

describe("reading a stored document", () => {
  it("reads a document of the known shape", () => {
    expect(readContent(report())).toEqual(CONTENT);
  });

  it("refuses another version, a missing headline and an empty figure list instead of guessing", () => {
    expect(readContent(report({ contentVersion: 2 }))).toBeNull();
    expect(readContent(report({ content: { ...CONTENT, headline: "" } }))).toBeNull();
    expect(readContent(report({ content: { ...CONTENT, figures: [] } }))).toBeNull();
    expect(readContent(report({ content: { ...CONTENT, lists: [{ title: "Top searches", rows: [] }] } }))).toBeNull();
    expect(readContent(report({ content: {} }))).toBeNull();
  });

  it("builds the list highlights from the readable headlines only", () => {
    const [month] = groupSentByMonth([report({ id: "w" }), report({ id: "x", service: "social", content: {} })]);
    expect(month === undefined ? null : highlightsOf(month)).toBe(CONTENT.headline);
    const [broken] = groupSentByMonth([report({ content: {} })]);
    expect(broken === undefined ? "x" : highlightsOf(broken)).toBeNull();
  });
});

describe("readContent lists", () => {
  it("keeps the ranked lists of a report that has them, and reads one that has none", () => {
    const lists = [{ title: "Most viewed pages in October", rows: [{ label: "/", value: "1,900 views" }] }];
    expect(readContent(report({ content: { ...CONTENT, lists } }))?.lists).toEqual(lists);
    expect(readContent(report({ content: CONTENT }))?.lists).toBeUndefined();
  });
});
