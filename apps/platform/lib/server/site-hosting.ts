import "server-only";
import { findBillingState, listHostedSites, recordHostingSync } from "@brandbasket/db";
import { summariseBilling } from "@brandbasket/shared/lib/billing/status";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";
import { runSiteHostingSync, type HostingSyncDeps, type HostingSyncReport, type SyncSite } from "@/lib/site-hosting-sync";
import { setVercelProjectPaused } from "@/lib/vercel-projects";
import { getStaffDb } from "./db";

/**
 * The secret the hourly hosting job sends as `Authorization: Bearer <token>`. Its own secret: it can take websites
 * offline. Unset or too short means the route refuses every request.
 */
export function siteHostingSyncToken(): string | null {
  const token = process.env.SITE_HOSTING_SYNC_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

/** The Vercel API token, or null when it is not set. Without it a dry run still works and a real run records an error per site. */
export function vercelApiToken(): string | null {
  const token = process.env.VERCEL_API_TOKEN?.trim() ?? "";
  return token === "" ? null : token;
}

/**
 * The billing rule for one business, as the hosting sync needs it. A business whose billing cannot be read is null, which
 * the plan treats as "change nothing": a database fault must never take a website offline.
 */
async function readBilling(businessId: string, now: Date): Promise<SyncSite["billing"]> {
  try {
    const state = await findBillingState(getStaffDb(), businessId);
    if (state === null) return null;
    const { hasWebsite, paymentUnderReview } = summariseBilling(state, now);
    return { hasWebsite, paymentUnderReview };
  } catch (error) {
    console.error("Could not read billing for the hosting sync.", errorLogInfo(error));
    return null;
  }
}

function realDeps(now: Date): HostingSyncDeps {
  const db = getStaffDb();
  return {
    listSites: async (businessId) => {
      const sites = await listHostedSites(db, businessId);
      const withBilling: SyncSite[] = [];
      // One at a time: findBillingState runs several statements and a fleet this size does not need them in parallel.
      for (const site of sites) withBilling.push({ ...site, billing: await readBilling(site.businessId, now) });
      return withBilling;
    },
    setPaused: (site, paused) => setVercelProjectPaused(site, paused, { token: vercelApiToken() }),
    record: (businessId, result) => recordHostingSync(db, businessId, result),
  };
}

/** The hourly job's run over every hosted site. */
export function syncSiteHosting(options: { readonly dryRun: boolean }): Promise<HostingSyncReport> {
  const now = new Date();
  return runSiteHostingSync(realDeps(now), { now, dryRun: options.dryRun });
}

/**
 * Brings one business's hosting in line with its billing right now: called after a payment so a client who pays is back
 * in seconds, not at the next hourly run. Never throws, because the payment it follows has already been taken; the
 * hourly job is the backstop for anything this misses.
 */
export async function syncSiteHostingForBusiness(businessId: string): Promise<void> {
  try {
    const now = new Date();
    await runSiteHostingSync(realDeps(now), { now, dryRun: false, businessId });
  } catch (error) {
    console.error("Could not sync a business's hosting after its payment.", errorLogInfo(error));
  }
}
