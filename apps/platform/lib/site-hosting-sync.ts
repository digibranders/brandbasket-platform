import { planHostingActions, type HostingHold } from "@brandbasket/billing";
import type { HostedSite, HostingSyncResult } from "@brandbasket/db";

/*
 * One run of the hosting sync (docs/plans/57-site-lapse-hosting-enforcement.md): finds every client whose website has
 * ended, records it and tells the team, and records the ones that paid as back online, with everything it touches passed
 * in so it can be tested without a database or the host. The decision itself is planHostingActions; this carries it out
 * and keeps going when one site fails, so a single bad project id cannot stop the rest.
 *
 * What visitors see while a site is offline is the site's own maintenance page (its proxy answers 503), not anything the
 * sync does. The sync touches the host only for a site that opted in (hostPause), because a paused Vercel project shows
 * Vercel's own page to the business's customers.
 */

/** A hosted site together with what the billing rule says about its business (null when billing could not be read). */
export interface SyncSite extends HostedSite {
  readonly billing: { readonly hasWebsite: boolean; readonly paymentUnderReview: boolean } | null;
}

export interface HostingSyncDeps {
  /** Every hosted site, or just one business's. */
  readonly listSites: (businessId?: string) => Promise<readonly SyncSite[]>;
  /** Pauses or unpauses the site's project at the host; called only for a site with hostPause. Throws, with a message safe to store, when the host refuses. */
  readonly setPaused: (site: HostedSite, paused: boolean) => Promise<void>;
  readonly record: (businessId: string, result: HostingSyncResult) => Promise<void>;
  /** Tells the team a website just went offline, with the details. Best-effort: a failure here never undoes it. */
  readonly announceOffline?: (site: HostedSite, at: Date) => Promise<void>;
}

export interface HostingSyncOptions {
  readonly now: Date;
  /** Report what would change and change nothing. */
  readonly dryRun: boolean;
  /** Only this business. */
  readonly businessId?: string;
}

export type HostingSyncItem =
  | { readonly businessId: string; readonly status: "went-offline" | "back-online" | "would-go-offline" | "would-go-online" }
  | { readonly businessId: string; readonly status: "failed"; readonly error: string };

export interface HostingSyncReport {
  readonly dryRun: boolean;
  readonly sites: number;
  readonly items: readonly HostingSyncItem[];
  readonly held: readonly HostingHold[];
  /** Too many sites were due to go offline at once, so none was taken offline. Needs a person to look. */
  readonly braked: boolean;
  readonly failed: number;
}

async function announce(deps: HostingSyncDeps, site: HostedSite, at: Date): Promise<void> {
  try {
    await deps.announceOffline?.(site, at);
  } catch (error) {
    console.error("The team could not be told a website went offline.", error instanceof Error ? error.name : "error");
  }
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
    // "pause" in the plan means the website goes offline; "unpause" means it is back.
    const goingOffline = action === "pause";
    if (options.dryRun) {
      items.push({ businessId, status: goingOffline ? "would-go-offline" : "would-go-online" });
      continue;
    }
    try {
      if (site.hostPause) await deps.setPaused(site, goingOffline);
      await deps.record(businessId, { checkedAt: options.now, pausedAt: goingOffline ? options.now : null, lastError: null });
      items.push({ businessId, status: goingOffline ? "went-offline" : "back-online" });
      if (goingOffline) await announce(deps, site, options.now);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The host refused the change.";
      // Nothing changed, so what we knew stays; only the error is new.
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
