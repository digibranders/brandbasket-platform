import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteHit } from "@brandbasket/db";
import { runSiteAnalyticsRollup, type RollupDeps } from "./site-analytics-rollup-run";

/** 2026-10-05 10:00 in India, so the days rolled up are the 4th and the 3rd. */
const NOW = new Date("2026-10-05T04:30:00.000Z");
const HASH = "0123456789abcdef0123456789abcdef";

function row(overrides: Partial<SiteHit> & { at: Date }): SiteHit {
  return { id: "h", businessId: "b1", kind: "pageview", path: "/", referrerHost: null, channel: "direct", utmSource: null, utmMedium: null, utmCampaign: null, device: "desktop", country: "IN", label: null, visitorHash: HASH, engagedMs: null, scrollPct: null, ...overrides };
}

let deps: { [K in keyof RollupDeps]: ReturnType<typeof vi.fn> & RollupDeps[K] };

beforeEach(() => {
  deps = {
    candidates: vi.fn(async () => [{ businessId: "b1", firstHitAt: new Date("2026-09-01T00:00:00.000Z") }]),
    hits: vi.fn(async () => []),
    legacy: vi.fn(async () => ({ call: 0, whatsapp: 0, form: 0 })),
    writeDaily: vi.fn(async () => undefined),
    writeBreakdown: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
    deleteOldHits: vi.fn(async () => 7),
    deleteOldSalts: vi.fn(async () => 2),
  } as never;
});

const metric = (rows: readonly { metric: string; value: number }[], name: string) => rows.find((entry) => entry.metric === name)?.value;
const dailyCalls = () => deps.writeDaily.mock.calls.map(([businessId, day, rows]) => ({ businessId, day, rows: rows as { metric: string; value: number }[] }));

describe("runSiteAnalyticsRollup", () => {
  it("rolls up the last two Indian days for a business whose script is live, quiet days as measured zeros", async () => {
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(dailyCalls().map((call) => [call.businessId, call.day])).toEqual([["b1", "2026-10-03"], ["b1", "2026-10-04"]]);
    expect(metric(dailyCalls()[0]?.rows ?? [], "own.visits")).toBe(0);
    expect(metric(dailyCalls()[0]?.rows ?? [], "own.pageviews")).toBe(0);
    expect(report).toMatchObject({ dryRun: false, days: ["2026-10-03", "2026-10-04"], businesses: 1, daysWritten: 2, daysSkipped: 0, failures: [] });
  });

  it("asks for each day's hits within that Indian day", async () => {
    await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    const windows = deps.hits.mock.calls.filter(([, from, to]) => (to as Date).getTime() - (from as Date).getTime() === 24 * 3600 * 1000).map(([, from]) => (from as Date).toISOString());
    expect(windows).toContain("2026-10-02T18:30:00.000Z");
    expect(windows).toContain("2026-10-03T18:30:00.000Z");
  });

  it("counts a day's page views, visits and taps from that day's hits", async () => {
    const day = new Date("2026-10-03T18:30:00.000Z").getTime();
    deps.hits.mockImplementation(async (_business, from) =>
      (from as Date).toISOString() === "2026-10-03T18:30:00.000Z"
        ? [row({ at: new Date(day + 60_000) }), row({ at: new Date(day + 120_000), kind: "call" })]
        : [],
    );
    await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    const fourth = dailyCalls().find((call) => call.day === "2026-10-04")?.rows ?? [];
    expect([metric(fourth, "own.pageviews"), metric(fourth, "own.visits"), metric(fourth, "own.calls")]).toEqual([1, 1, 1]);
  });

  it("fills a count the script did not see from the older route, never adding the two", async () => {
    deps.legacy.mockResolvedValue({ call: 4, whatsapp: 0, form: 3 });
    await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    const rows = dailyCalls()[0]?.rows ?? [];
    expect([metric(rows, "own.calls"), metric(rows, "own.form_sends"), metric(rows, "own.visits")]).toEqual([4, 3, 0]);
  });

  it("gives only the three enquiry numbers for a site with no script, and nothing for a quiet day on it", async () => {
    deps.candidates.mockResolvedValue([{ businessId: "b2", firstHitAt: null }]);
    deps.legacy.mockImplementation(async (_business, from) => ((from as Date).toISOString() === "2026-10-03T18:30:00.000Z" ? { call: 2, whatsapp: 0, form: 0 } : { call: 0, whatsapp: 0, form: 0 }));
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(dailyCalls()).toHaveLength(1);
    expect(dailyCalls()[0]).toMatchObject({ businessId: "b2", day: "2026-10-04" });
    expect(dailyCalls()[0]?.rows.map((entry) => entry.metric)).toEqual(["own.calls", "own.whatsapp", "own.form_sends"]);
    expect(report).toMatchObject({ daysWritten: 1, daysSkipped: 1 });
    expect(deps.writeBreakdown).not.toHaveBeenCalled();
  });

  it("treats a day before the script's first hit as a day without the script", async () => {
    deps.candidates.mockResolvedValue([{ businessId: "b1", firstHitAt: new Date("2026-10-04T05:00:00.000Z") }]);
    await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(dailyCalls().map((call) => call.day)).toEqual(["2026-10-04"]);
  });

  it("writes the month's lists from the month's hits so far", async () => {
    deps.hits.mockImplementation(async (_business, from, to) =>
      (to as Date).getTime() - (from as Date).getTime() > 24 * 3600 * 1000 ? [row({ at: new Date("2026-10-02T05:00:00.000Z"), channel: "search", path: "/services" }), row({ at: new Date("2026-10-02T05:01:00.000Z"), kind: "call", path: "/services", channel: "search" })] : [],
    );
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    const written = deps.writeBreakdown.mock.calls.map(([, month, dimension]) => [month, dimension]);
    expect(written).toContainEqual(["2026-10-01", "channel"]);
    expect(written).toContainEqual(["2026-10-01", "enquiry_page"]);
    const monthWindow = deps.hits.mock.calls.find(([, from, to]) => (to as Date).getTime() - (from as Date).getTime() > 24 * 3600 * 1000);
    expect((monthWindow?.[1] as Date).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect((monthWindow?.[2] as Date).toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(report.breakdownsWritten).toBeGreaterThan(0);
  });

  it("rolls up both months when the days straddle a month end", async () => {
    await runSiteAnalyticsRollup(deps, { now: new Date("2026-11-02T04:30:00.000Z"), dryRun: false });
    expect(dailyCalls().map((call) => call.day)).toEqual(["2026-10-31", "2026-11-01"]);
    const months = new Set(deps.hits.mock.calls.map(([, from]) => (from as Date).toISOString()));
    expect(months).toContain("2026-09-30T18:30:00.000Z");
    expect(months).toContain("2026-10-31T18:30:00.000Z");
  });

  it("carries on when one business fails, and records and reports it without the error's details", async () => {
    deps.candidates.mockResolvedValue([
      { businessId: "bad", firstHitAt: new Date("2026-09-01T00:00:00.000Z") },
      { businessId: "good", firstHitAt: new Date("2026-09-01T00:00:00.000Z") },
    ]);
    deps.hits.mockImplementation(async (business) => {
      if (business === "bad") throw new Error("connection string postgres://secret");
      return [];
    });
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(report.failures).toEqual([{ businessId: "bad", errorName: "Error" }]);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(dailyCalls().every((call) => call.businessId === "good")).toBe(true);
    expect(deps.recordFailure).toHaveBeenCalledTimes(1);
    expect(deps.recordFailure.mock.calls[0]?.[0]).toBe("bad");
  });

  it("changes nothing on a dry run, but says what it would write", async () => {
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: true });
    expect(deps.writeDaily).not.toHaveBeenCalled();
    expect(deps.writeBreakdown).not.toHaveBeenCalled();
    expect(deps.deleteOldHits).not.toHaveBeenCalled();
    expect(deps.deleteOldSalts).not.toHaveBeenCalled();
    expect(report).toMatchObject({ dryRun: true, daysWritten: 2, hitsDeleted: null, saltsDeleted: null });
  });

  it("deletes hits older than 90 days and salts older than yesterday", async () => {
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(deps.deleteOldHits).toHaveBeenCalledWith(new Date("2026-07-07T04:30:00.000Z"));
    expect(deps.deleteOldSalts).toHaveBeenCalledWith("2026-10-04");
    expect(report).toMatchObject({ hitsDeleted: 7, saltsDeleted: 2 });
  });

  it("does nothing for a night with no candidates", async () => {
    deps.candidates.mockResolvedValue([]);
    const report = await runSiteAnalyticsRollup(deps, { now: NOW, dryRun: false });
    expect(report).toMatchObject({ businesses: 0, daysWritten: 0, breakdownsWritten: 0 });
  });
});
