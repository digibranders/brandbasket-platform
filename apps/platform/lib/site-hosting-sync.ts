import { planHostingActions, type HostingHold } from "@brandbasket/billing";
import type { HostedSite, HostingSyncResult } from "@brandbasket/db";

/*
 * One run of the hosting sync (docs/plans/57-site-lapse-hosting-enforcement.md): pauses the hosting project of every
 * client whose website has ended and unpauses the ones that paid, with everything it touches passed in so it can be
 * tested without a database or the host. The decision itself is planHostingActions; this carries it out and keeps
 * going when one site fails, so a single bad project id cannot stop the rest.
 */

/** A hosted site together with what the billing rule says about its business (null when billing could not be read). */
export interface SyncSite extends HostedSite {
  readonly billing: { readonly hasWebsite: boolean; readonly paymentUnderReview: boolean } | null;
}

export interface HostingSyncDeps {
  /** Every hosted site, or just one business's. */
  readonly listSites: (businessId?: string) => Promise<readonly SyncSite[]>;
  /** Pauses or unpauses the site's project at the host. Throws, with a message safe to store, when the host refuses. */
  readonly setPaused: (site: HostedSite, paused: boolean) => Promise<void>;
  readonly record: (businessId: string, result: HostingSyncResult) => Promise<void>;
}

export interface HostingSyncOptions {
  readonly now: Date;
  /** Report what would change and change nothing. */
  readonly dryRun: boolean;
  /** Only this business. */
  readonly businessId?: string;
}

export type HostingSyncItem =
  | { readonly businessId: string; readonly status: "paused" | "unpaused" | "would-pause" | "would-unpause" }
  | { readonly businessId: string; readonly status: "failed"; readonly error: string };

export interface HostingSyncReport {
  readonly dryRun: boolean;
  readonly sites: number;
  readonly items: readonly HostingSyncItem[];
  readonly held: readonly HostingHold[];
  /** Too many pauses were due at once, so none was applied. Needs a person to look. */
  readonly braked: boolean;
  readonly failed: number;
}

export async function runSiteHostingSync(deps: HostingSyncDeps, options: HostingSyncOptions): Promise<HostingSyncReport> {
  const sites = await deps.listSites(options.businessId);
  const plan = planHostingActions(
    sites.map((site) => ({
      businessId: site.businessId,
      paused: site.pausedAt !== null,
      hasLiveProject: site.hasLiveProject,
      billing: site.billing,
    })),
  );

  const byBusiness = new Map(sites.map((site) => [site.businessId, site]));
  const acted = new Set<string>();
  const items: HostingSyncItem[] = [];

  for (const { businessId, action } of plan.actions) {
    const site = byBusiness.get(businessId);
    if (site === undefined) continue;
    acted.add(businessId);
    const pausing = action === "pause";
    if (options.dryRun) {
      items.push({ businessId, status: pausing ? "would-pause" : "would-unpause" });
      continue;
    }
    try {
      await deps.setPaused(site, pausing);
      await deps.record(businessId, { checkedAt: options.now, pausedAt: pausing ? options.now : null, lastError: null });
      items.push({ businessId, status: pausing ? "paused" : "unpaused" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The host refused the change.";
      // The host did not change, so what we knew about it stays; only the error is new.
      await deps.record(businessId, { checkedAt: options.now, pausedAt: site.pausedAt, lastError: message });
      items.push({ businessId, status: "failed", error: message });
    }
  }

  if (!options.dryRun) {
    for (const site of sites) {
      if (!acted.has(site.businessId)) {
        await deps.record(site.businessId, { checkedAt: options.now, pausedAt: site.pausedAt, lastError: site.lastError });
      }
    }
  }

  return {
    dryRun: options.dryRun,
    sites: sites.length,
    items,
    held: plan.held,
    braked: plan.braked,
    failed: items.filter((item) => item.status === "failed").length,
  };
}
