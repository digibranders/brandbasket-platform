import { describe, expect, it } from "vitest";
import { dailyMetrics, monthlyBreakdowns, OWN_DAILY_METRICS, type RollupHit } from "./rollup";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 4, 0, 0) + minutes * 60_000);
function hit(overrides: Partial<Omit<RollupHit, "at">> & Pick<RollupHit, "visitorHash"> & { readonly minute: number }): RollupHit {
  const { minute, ...rest } = overrides;
  return { at: at(minute), kind: "pageview", path: "/", referrerHost: null, channel: "direct", utmCampaign: null, device: "desktop", country: "IN", label: null, engagedMs: null, ...rest };
}
const value = (rows: readonly { metric: string; value: number }[], metric: string) => rows.find((row) => row.metric === metric)?.value;

describe("dailyMetrics", () => {
  it("counts a quiet day as measured zeros, one row per metric", () => {
    const rows = dailyMetrics([]);
    expect(rows.map((row) => row.metric)).toEqual([...OWN_DAILY_METRICS]);
    expect(rows.every((row) => row.value === 0)).toBe(true);
  });

  it("counts page views, visits and visitors", () => {
    const rows = dailyMetrics([
      hit({ visitorHash: "a", minute: 0 }),
      hit({ visitorHash: "a", minute: 5, path: "/about" }),
      hit({ visitorHash: "a", minute: 90 }),
      hit({ visitorHash: "b", minute: 1 }),
    ]);
    expect(value(rows, "own.pageviews")).toBe(4);
    expect(value(rows, "own.visits")).toBe(3);
    expect(value(rows, "own.visitors")).toBe(2);
  });

  it("counts each kind of tap and form send, and not as page views", () => {
    const rows = dailyMetrics([
      hit({ visitorHash: "a", minute: 0 }),
      hit({ visitorHash: "a", minute: 1, kind: "call" }),
      hit({ visitorHash: "a", minute: 2, kind: "call" }),
      hit({ visitorHash: "a", minute: 3, kind: "whatsapp" }),
      hit({ visitorHash: "a", minute: 4, kind: "email" }),
      hit({ visitorHash: "a", minute: 5, kind: "directions" }),
      hit({ visitorHash: "a", minute: 6, kind: "social", label: "instagram.com" }),
      hit({ visitorHash: "a", minute: 7, kind: "form" }),
      hit({ visitorHash: "a", minute: 8, kind: "outbound", label: "justdial.com" }),
    ]);
    expect([value(rows, "own.calls"), value(rows, "own.whatsapp"), value(rows, "own.emails"), value(rows, "own.directions"), value(rows, "own.social_taps"), value(rows, "own.form_sends")]).toEqual([2, 1, 1, 1, 1, 1]);
    expect(value(rows, "own.pageviews")).toBe(1);
  });

  it("adds engaged time in whole seconds", () => {
    const rows = dailyMetrics([hit({ visitorHash: "a", minute: 0 }), hit({ visitorHash: "a", minute: 1, kind: "engagement", engagedMs: 12_400 }), hit({ visitorHash: "b", minute: 2, kind: "engagement", engagedMs: 30_000 })]);
    expect(value(rows, "own.engaged_seconds")).toBe(42);
  });
});

describe("monthlyBreakdowns", () => {
  const hits: RollupHit[] = [
    hit({ visitorHash: "a", minute: 0, channel: "search", referrerHost: "google.com", device: "mobile", country: "IN", path: "/services" }),
    hit({ visitorHash: "a", minute: 2, kind: "call", channel: "search", path: "/services" }),
    hit({ visitorHash: "b", minute: 1, channel: "direct", device: "desktop", country: "IN", path: "/" }),
    hit({ visitorHash: "c", minute: 3, channel: "social", referrerHost: "l.instagram.com", device: "mobile", country: "US", path: "/", utmCampaign: "diwali" }),
    hit({ visitorHash: "c", minute: 4, kind: "form", channel: "social", path: "/contact" }),
    hit({ visitorHash: "c", minute: 5, kind: "email", channel: "social", path: "/contact" }),
  ];
  const find = (dimension: string) => monthlyBreakdowns(hits).find((entry) => entry.dimension === dimension)?.rows;

  it("ranks visits by the channel the visit started with", () => {
    expect(find("channel")).toEqual([{ key: "direct", count: 1 }, { key: "search", count: 1 }, { key: "social", count: 1 }]);
  });

  it("ranks pages by page views, biggest first, ties by name", () => {
    expect(find("page")).toEqual([{ key: "/", count: 2 }, { key: "/services", count: 1 }]);
  });

  it("lists referrers, devices, countries and campaigns by visits", () => {
    expect(find("referrer")).toEqual([{ key: "google.com", count: 1 }, { key: "l.instagram.com", count: 1 }]);
    expect(find("device")).toEqual([{ key: "desktop", count: 1 }, { key: "mobile", count: 2 }].sort((x, y) => y.count - x.count || x.key.localeCompare(y.key)));
    expect(find("country")).toEqual([{ key: "IN", count: 2 }, { key: "US", count: 1 }]);
    expect(find("campaign")).toEqual([{ key: "diwali", count: 1 }]);
  });

  it("says which pages and which channels the enquiries came from", () => {
    expect(find("enquiry_page")).toEqual([{ key: "/contact", count: 2 }, { key: "/services", count: 1 }]);
    expect(find("enquiry_channel")).toEqual([{ key: "social", count: 2 }, { key: "search", count: 1 }]);
  });

  it("leaves out a list that has nothing in it", () => {
    const only = monthlyBreakdowns([hit({ visitorHash: "a", minute: 0, country: null })]);
    expect(only.map((entry) => entry.dimension)).not.toContain("country");
    expect(only.map((entry) => entry.dimension)).not.toContain("enquiry_page");
    expect(monthlyBreakdowns([])).toEqual([]);
  });

  it("keeps the top ten of a long list", () => {
    const many = Array.from({ length: 15 }, (_, index) => hit({ visitorHash: `v${index}`, minute: index, path: `/p${String(index).padStart(2, "0")}` }));
    expect(monthlyBreakdowns(many).find((entry) => entry.dimension === "page")?.rows).toHaveLength(10);
  });
});
