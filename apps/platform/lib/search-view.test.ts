import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchView } from "@/components/search/search-view";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { SearchData } from "@/lib/server/search";
import type { TodoItem } from "@/lib/todo";

const waitingItem = (key: string, overrides: Partial<TodoItem> = {}): TodoItem =>
  ({ key, label: `Tell us ${key}`, hint: "Two minutes", service: "search", done: false, kind: "form", setup: "areas", ...overrides }) as TodoItem;

function data(overrides: Partial<SearchData> = {}): SearchData {
  return {
    summary: {
      pageOne: { figure: "14", detail: "Up from 6" },
      pages: [
        { id: "p1", title: "Emergency plumber page", dueOn: "2026-11-18", linkUrl: "https://example.com/emergency" },
        { id: "p2", title: "Water heater page", dueOn: "2026-11-04", linkUrl: null },
      ],
      listings: [{ id: "l1", title: "Opening hours on Google" }],
    },
    waiting: [],
    report: null,
    month: "November",
    ...overrides,
  };
}

const render = (value: SearchData): string => renderToStaticMarkup(createElement(SearchView, { data: value }));
const darkButtons = (html: string): number => html.split(DARK_BUTTON).length - 1;

describe("SearchView", () => {
  it("shows the header, the month line and the four sections for a full summary", () => {
    const html = render(data({ waiting: [waitingItem("areas")], report: "https://example.com/report.pdf" }));

    expect(html).toContain("Search");
    expect(html).toContain("November: 14 searches show you on Google&#x27;s first page.");
    expect(html).toContain("Monthly report");
    expect(html).toContain('href="https://example.com/report.pdf"');
    expect(html).toContain("Waiting on you");
    expect(html).toContain("Searches on Google&#x27;s first page");
    expect(html).toContain("Up from 6");
    expect(html).toContain("Pages we improved in November");
    expect(html).toContain("Emergency plumber page");
    expect(html).toContain("Wed 18 Nov");
    expect(html).toContain('href="https://example.com/emergency"');
    expect(html).toContain("Listings we fixed");
    expect(html).toContain("Opening hours on Google");
  });

  it("orders the sections: waiting, figure, pages, listings", () => {
    const html = render(data({ waiting: [waitingItem("areas")] }));
    const at = ["Waiting on you", "Searches on Google&#x27;s first page", "Pages we improved in", "Listings we fixed"].map((text) => html.indexOf(text));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says each empty section in its own line", () => {
    const html = render(data({ summary: { pageOne: { figure: "14", detail: null }, pages: [], listings: [] } }));
    expect(html).toContain("No pages finished yet this month.");
    expect(html).toContain("No listings fixed yet this month.");
  });

  it("leaves out the figure section and the month line when no figure was measured, never showing a zero", () => {
    const html = render(data({ summary: { pageOne: null, pages: [], listings: [] } }));
    expect(html).not.toContain("Searches on Google&#x27;s first page");
    expect(html).not.toContain("show you on Google");
    expect(html).not.toContain(">0<");
  });

  it("leaves out the detail line when there is no change to report", () => {
    const html = render(data({ summary: { pageOne: { figure: "14", detail: null }, pages: [], listings: [] } }));
    expect(html).not.toContain("Up from");
  });

  it("has no Monthly report button without a report", () => {
    expect(render(data())).not.toContain("Monthly report");
  });

  it("does not link a report address that is not https", () => {
    expect(render(data({ report: "javascript:alert(1)" }))).not.toContain("Monthly report");
  });

  it("has the one dark button only when something is waiting, on the first item", () => {
    expect(darkButtons(render(data()))).toBe(0);
    const html = render(data({ waiting: [waitingItem("a"), waitingItem("b", { kind: "link", href: "/onboarding/x" } as Partial<TodoItem>)] }));
    expect(darkButtons(html)).toBe(1);
    expect(html).toContain('href="/todo?focus=a#a"');
    expect(html).toContain('href="/onboarding/x"');
    expect(html.indexOf(DARK_BUTTON)).toBeLessThan(html.indexOf('href="/onboarding/x"'));
  });

  it("has no Waiting on you section when nothing is waiting", () => {
    expect(render(data())).not.toContain("Waiting on you");
  });
});
