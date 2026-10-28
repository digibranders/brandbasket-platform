import { describe, expect, it, vi } from "vitest";
import type { HostingSyncResult } from "@brandbasket/db";
import { runSiteHostingSync, type HostingSyncDeps, type SyncSite } from "./site-hosting-sync";

const NOW = new Date("2026-10-28T10:00:00Z");
const EARLIER = new Date("2026-10-27T10:00:00Z");

function site(id: string, overrides: Partial<SyncSite> = {}): SyncSite {
  return {
    businessId: id,
    vercelProjectId: `prj_${id}`,
    vercelTeamId: "team_abc",
    hostPause: true,
    pausedAt: null,
    lastError: null,
    hasLiveProject: true,
    billing: { hasWebsite: true, paymentUnderReview: false },
    ...overrides,
  };
}

const lapsed = { hasWebsite: false, paymentUnderReview: false } as const;

function deps(sites: readonly SyncSite[], overrides: Partial<HostingSyncDeps> = {}) {
  const setPaused = vi.fn<HostingSyncDeps["setPaused"]>().mockResolvedValue(undefined);
  const record = vi.fn<(businessId: string, result: HostingSyncResult) => Promise<void>>().mockResolvedValue(undefined);
  const value: HostingSyncDeps = { listSites: async () => sites, setPaused, record, ...overrides };
  return { value, setPaused, record };
}

describe("runSiteHostingSync", () => {
  it("takes a lapsed site offline, pauses its project and records when", async () => {
    const d = deps([site("a", { billing: lapsed })]);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.setPaused).toHaveBeenCalledWith(expect.objectContaining({ businessId: "a" }), true);
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: NOW, lastError: null });
    expect(report.items).toEqual([{ businessId: "a", status: "went-offline" }]);
    expect(report.failed).toBe(0);
  });

  it("tells the team about a site it took offline, once, and not about one that came back", async () => {
    const announceOffline = vi.fn<NonNullable<HostingSyncDeps["announceOffline"]>>().mockResolvedValue(undefined);
    const d = deps([site("a", { billing: lapsed }), site("b", { pausedAt: EARLIER })], { announceOffline });
    await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(announceOffline).toHaveBeenCalledTimes(1);
    expect(announceOffline).toHaveBeenCalledWith(expect.objectContaining({ businessId: "a" }), NOW);
  });

  it("does not tell the team in a dry run or when the host refused", async () => {
    const announceOffline = vi.fn<NonNullable<HostingSyncDeps["announceOffline"]>>().mockResolvedValue(undefined);
    await runSiteHostingSync(deps([site("a", { billing: lapsed })], { announceOffline }).value, { now: NOW, dryRun: true });
    const refuse = vi.fn<HostingSyncDeps["setPaused"]>().mockRejectedValue(new Error("no"));
    await runSiteHostingSync(deps([site("a", { billing: lapsed })], { announceOffline, setPaused: refuse }).value, { now: NOW, dryRun: false });
    expect(announceOffline).not.toHaveBeenCalled();
  });

  it("keeps the result and the report when the announcement fails", async () => {
    const announceOffline = vi.fn<NonNullable<HostingSyncDeps["announceOffline"]>>().mockRejectedValue(new Error("Teams is down"));
    const d = deps([site("a", { billing: lapsed })], { announceOffline });
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(report.items).toEqual([{ businessId: "a", status: "went-offline" }]);
    expect(report.failed).toBe(0);
  });

  it("leaves the host alone for a site that did not opt in, but still records the lapse and tells the team", async () => {
    const announceOffline = vi.fn<NonNullable<HostingSyncDeps["announceOffline"]>>().mockResolvedValue(undefined);
    const d = deps([site("a", { hostPause: false, billing: lapsed })], { announceOffline });
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.setPaused).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: NOW, lastError: null });
    expect(announceOffline).toHaveBeenCalledWith(expect.objectContaining({ businessId: "a" }), NOW);
    expect(report.items).toEqual([{ businessId: "a", status: "went-offline" }]);
    expect(report.failed).toBe(0);
  });

  it("does not call the host to bring back a site that did not opt in", async () => {
    const d = deps([site("a", { hostPause: false, pausedAt: EARLIER })]);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.setPaused).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: null, lastError: null });
    expect(report.items).toEqual([{ businessId: "a", status: "back-online" }]);
  });

  it("brings a site that paid back, unpauses its project and clears the offline time", async () => {
    const d = deps([site("a", { pausedAt: EARLIER })]);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.setPaused).toHaveBeenCalledWith(expect.objectContaining({ businessId: "a" }), false);
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: null, lastError: null });
    expect(report.items).toEqual([{ businessId: "a", status: "back-online" }]);
  });

  it("changes nothing in a dry run", async () => {
    const d = deps([site("a", { billing: lapsed }), site("b", { pausedAt: EARLIER })]);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: true });
    expect(d.setPaused).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
    expect(report.items).toEqual([
      { businessId: "a", status: "would-go-offline" },
      { businessId: "b", status: "would-go-online" },
    ]);
  });

  it("keeps the state and records the error when the host refuses", async () => {
    const setPaused = vi.fn<HostingSyncDeps["setPaused"]>().mockRejectedValue(new Error("Vercel answered 403."));
    const d = deps([site("a", { billing: lapsed })], { setPaused });
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: null, lastError: "Vercel answered 403." });
    expect(report.items).toEqual([{ businessId: "a", status: "failed", error: "Vercel answered 403." }]);
    expect(report.failed).toBe(1);
  });

  it("goes on to the next site after one fails", async () => {
    const setPaused = vi
      .fn<HostingSyncDeps["setPaused"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const d = deps([site("a", { billing: lapsed }), site("b", { billing: lapsed })], { setPaused });
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(report.items.map((item) => item.status)).toEqual(["failed", "went-offline"]);
  });

  it("takes none offline when the brake trips, and says so", async () => {
    const lapsedSites = ["a", "b", "c", "d"].map((id) => site(id, { billing: lapsed }));
    const d = deps(lapsedSites);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(report.braked).toBe(true);
    expect(d.setPaused).not.toHaveBeenCalled();
    expect(report.items).toEqual([]);
  });

  it("only stamps the check on a site with nothing to do, keeping what it knew", async () => {
    const d = deps([site("a", { pausedAt: EARLIER, lastError: "old", billing: lapsed })]);
    await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(d.setPaused).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith("a", { checkedAt: NOW, pausedAt: EARLIER, lastError: "old" });
  });

  it("reports the sites it held back", async () => {
    const d = deps([site("a", { billing: { hasWebsite: false, paymentUnderReview: true } })]);
    const report = await runSiteHostingSync(d.value, { now: NOW, dryRun: false });
    expect(report.held).toEqual([{ businessId: "a", reason: "payment-under-review" }]);
  });

  it("passes a single business through to the lookup", async () => {
    const listSites = vi.fn<HostingSyncDeps["listSites"]>().mockResolvedValue([]);
    const d = deps([], { listSites });
    await runSiteHostingSync(d.value, { now: NOW, dryRun: false, businessId: "a" });
    expect(listSites).toHaveBeenCalledWith("a");
  });
});
