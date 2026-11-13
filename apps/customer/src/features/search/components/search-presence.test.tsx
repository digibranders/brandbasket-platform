import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Loaded } from "@/lib/loaded";
import type { SearchPresence } from "../rules/search-presence";
import { googleClicksMetric, SearchPresencePanel } from "./search-presence";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));

const NOW = new Date("2026-11-03T06:00:00.000Z");
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const days = Array.from({ length: 28 }, (_, index) => ({ day: `2026-10-${String(index + 3).padStart(2, "0")}`, value: index % 5 }));
const measured = (over: { change?: number | null; impressions?: number | null; averagePosition?: number | null; lists?: boolean } = {}): Loaded<SearchPresence> => ({
  ok: true,
  data: {
    kind: "measured",
    summary: { from: "2026-10-03", to: "2026-10-30", clicks: 214, impressions: 5830, averagePosition: 8.4, change: 18, days, ...over },
    lists:
      over.lists === false
        ? null
        : {
            month: "2026-11-01",
            queries: [{ label: "sweet shop near me", value: 48 }, { label: "om sweets pune", value: 39 }],
            pages: [{ label: "Home", value: 96 }, { label: "/menu", value: 61 }],
          },
  },
});

describe("SearchPresencePanel", () => {
  it("draws nothing when the switch is off, there is no connection, or nothing was read", () => {
    expect(render(<SearchPresencePanel search={null} />).container.firstChild).toBeNull();
    expect(render(<SearchPresencePanel search={{ ok: true, data: null }} />).container.firstChild).toBeNull();
  });

  it("measured: the dates, the three figures with their notes, the chart, the foot line and both tables", () => {
    const { container } = render(<SearchPresencePanel search={measured()} />);
    expect(screen.getByRole("heading", { name: "How people find you on Google" })).toBeTruthy();
    expect(screen.getByText("3 Oct to 30 Oct, Google data runs about 3 days behind")).toBeTruthy();
    expect(screen.getByText("Clicks", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("214")).toBeTruthy();
    expect(screen.getByText("+18")).toBeTruthy();
    expect(screen.getByText("on the 28 days before")).toBeTruthy();
    expect(screen.getByText("Times you appeared")).toBeTruthy();
    expect(screen.getByText("5,830")).toBeTruthy();
    expect(screen.getByText("Average position")).toBeTruthy();
    expect(screen.getByText("8.4")).toBeTruthy();
    expect(screen.getByText("1 is the top of Google")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Clicks by day" })).toBeTruthy();
    expect(screen.getByText(/A day with no clicks shows as zero/)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Top searches" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Pages people land on" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader", { name: "Clicks" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("sweet shop near me")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("/menu")).toBeTruthy();
    expect(container.textContent).not.toMatch(DASHES);
    expect(container.textContent).not.toMatch(/No data|undefined|\bnull\b|NaN/);
  });

  it("leaves out the change line, a figure that was not measured and a table with no rows, and never shows a 0 for them", () => {
    const { container } = render(<SearchPresencePanel search={measured({ change: null, impressions: null, averagePosition: null, lists: false })} />);
    expect(screen.getByText("214")).toBeTruthy();
    expect(screen.queryByText(/on the 28 days before/)).toBeNull();
    expect(screen.queryByText("Times you appeared")).toBeNull();
    expect(screen.queryByText("Average position")).toBeNull();
    expect(screen.queryByText("1 is the top of Google")).toBeNull();
    expect(screen.queryByText("Top searches")).toBeNull();
    expect(screen.queryByText("Pages people land on")).toBeNull();
    expect(container.textContent).not.toMatch(DASHES);
  });

  it("shows a negative change with its minus and a zero impressions count as measured", () => {
    render(<SearchPresencePanel search={measured({ change: -12, impressions: 0 })} />);
    expect(screen.getByText("-12")).toBeTruthy();
    expect(screen.getByText("Times you appeared")).toBeTruthy();
  });

  it("draws no chart for a single measured day", () => {
    const single = { ok: true as const, data: { kind: "measured" as const, summary: { from: "2026-10-30", to: "2026-10-30", clicks: 3, impressions: null, averagePosition: null, change: null, days: [{ day: "2026-10-30", value: 3 }] }, lists: null } };
    const { container } = render(<SearchPresencePanel search={single} />);
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("waiting: only the banner, no figures", () => {
    const { container } = render(<SearchPresencePanel search={{ ok: true, data: { kind: "waiting" } }} />);
    expect(screen.getByRole("heading", { name: "How people find you on Google" })).toBeTruthy();
    expect(screen.getByText("Numbers start within 2 to 3 days. Google is still getting your website ready, so nothing is measured yet.")).toBeTruthy();
    expect(screen.queryByText("Clicks")).toBeNull();
    expect(container.textContent).not.toMatch(DASHES);
  });

  it("failed: says so in its own panel with the app's Try again", () => {
    const { container } = render(<SearchPresencePanel search={{ ok: false, error: { at: NOW } }} />);
    expect(screen.getByRole("heading", { name: "How people find you on Google" })).toBeTruthy();
    expect(screen.getByText("We could not load how people find you on Google.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(container.textContent).not.toMatch(DASHES);
  });
});

describe("googleClicksMetric", () => {
  it("is Google clicks with the dates it covers and its change, only when measured", () => {
    expect(googleClicksMetric(measured())).toEqual([{ label: "Google clicks", value: "214", period: "3 Oct to 30 Oct", change: { value: 18 } }]);
    expect(googleClicksMetric(measured({ change: null }))[0]).not.toHaveProperty("change");
  });

  it("is nothing for waiting, failed, no connection or the switch off", () => {
    expect(googleClicksMetric({ ok: true, data: { kind: "waiting" } })).toEqual([]);
    expect(googleClicksMetric({ ok: false, error: { at: NOW } })).toEqual([]);
    expect(googleClicksMetric({ ok: true, data: null })).toEqual([]);
    expect(googleClicksMetric(null)).toEqual([]);
  });
});
