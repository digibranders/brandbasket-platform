import type { ProvisionCandidate, ProvisionedSourceInput, ProvisionSource } from "@brandbasket/db";
import type { AnalyticsAdmin } from "@brandbasket/shared/server/google/admin";
import { KEY_EVENTS } from "@brandbasket/shared/server/google/admin";
import { GoogleAccessLost } from "@brandbasket/shared/server/google/oauth";
import { mapPaced, type PaceOptions } from "@brandbasket/shared/server/google/pace";
import type { SiteVerification } from "@brandbasket/shared/server/google/site-verification";

/*
 * Go live for Google (plan 62): for every live site on its own domain, make its Analytics property, register and verify it in
 * Search Console through a meta tag the site itself serves, and add the second owner. Idempotent: each step stores what it did
 * before the next, and a step that finds its work done does nothing. A free address never gets a property. Nothing here reads
 * numbers; the nightly google:sync does that once a source is connected.
 */

export const TAG_WAIT_MS = 30 * 60_000;
/** About six writes per business against Google's 180 a minute: three at once, each lane waiting this long between businesses. */
export const BUSINESS_GAP_MS = 12_000;
export const GSC_ENV = "NEXT_PUBLIC_GSC_VERIFICATION";
export const GA4_ENV = "NEXT_PUBLIC_GA4_ID";

export interface ProvisionConfig {
  /** The Analytics account that holds every client's property. */
  readonly analyticsAccountName: string;
  readonly mainAccountEmail: string;
  /** The second human owner, or null while none is set: the owner step is then skipped and noted. */
  readonly secondOwnerEmail: string | null;
  /** Whether the Analytics tag goes on client sites. Off until counsel answers (plan 62, decision 4). */
  readonly analyticsTagEnabled: boolean;
  /** The domain free addresses are made on, or null when none is offered. */
  readonly freeBaseDomain: string | null;
}

export interface ProvisionDeps {
  readonly admin: AnalyticsAdmin;
  readonly verification: SiteVerification;
  readonly save: (input: ProvisionedSourceInput) => Promise<void>;
  readonly setEnv: (candidate: ProvisionCandidate, key: string, value: string) => Promise<void>;
  readonly redeploy: (candidate: ProvisionCandidate) => Promise<void>;
  /** Whether the live page at this hostname shows the verification token. */
  readonly pageShowsToken: (hostname: string, token: string) => Promise<boolean>;
  readonly config: ProvisionConfig;
  readonly now: Date;
}

export type SkipReason = "free-address" | "hosting-paused" | "detached";

/** Why this business gets no Google property, or null when it should. */
export function skipReason(candidate: ProvisionCandidate, config: ProvisionConfig): SkipReason | null {
  if (config.freeBaseDomain !== null && candidate.hostname.endsWith(`.${config.freeBaseDomain.toLowerCase()}`)) return "free-address";
  if (candidate.hostingPaused) return "hosting-paused";
  // Staff detached the business in the console: its rows are kept, and nothing is made or changed until they provision it again.
  return candidate.ga4?.status === "removed" || candidate.gsc?.status === "removed" ? "detached" : null;
}

const siteUrlOf = (candidate: ProvisionCandidate): string => `https://${candidate.hostname}/`;
const propertyName = (candidate: ProvisionCandidate): string => `${candidate.businessName} (${candidate.businessId.slice(0, 8)})`;

/** Nothing left for the job to do for this business. */
export function isComplete(candidate: ProvisionCandidate, config: ProvisionConfig): boolean {
  const { ga4, gsc } = candidate;
  if (gsc === null || gsc.externalId !== siteUrlOf(candidate) || gsc.verifiedAt === null) return false;
  if (config.secondOwnerEmail !== null && !gsc.secondOwnerOk) return false;
  if (ga4 === null || ga4.measurementId === null || ga4.provisionedAt === null) return false;
  return !(config.analyticsTagEnabled && ga4.status === "awaiting_setup");
}

export type ProvisionResult = "complete" | "working" | "waiting" | "skipped";
export interface ProvisionOutcome {
  readonly businessId: string;
  readonly result: ProvisionResult | "error";
  /** Words safe for staff: a failure class or a step, never a token, an id or Google's message. */
  readonly note: string | null;
}

async function ensureAnalytics(candidate: ProvisionCandidate, deps: ProvisionDeps): Promise<ProvisionSource> {
  const { admin, config, save, now } = deps;
  let ga4 = candidate.ga4;
  if (ga4 === null) {
    const account = await admin.findAccount(config.analyticsAccountName);
    if (account === null) throw new Error(`The Analytics account "${config.analyticsAccountName}" was not found.`);
    const name = propertyName(candidate);
    const existing = account.properties.find((property) => property.displayName === name);
    const propertyId = (existing?.property ?? `properties/${await admin.createProperty(account.account, name)}`).replace("properties/", "");
    await save({ businessId: candidate.businessId, source: "ga4", externalId: propertyId, status: "awaiting_setup", detail: "Property made, stream next", now });
    ga4 = { externalId: propertyId, status: "awaiting_setup", measurementId: null, verifiedAt: null, provisionedAt: null, secondOwnerOk: false, detail: null };
  }
  if (ga4.measurementId === null) {
    const measurementId = await admin.createWebStream(ga4.externalId, siteUrlOf(candidate), `${candidate.businessName} website`);
    await save({ businessId: candidate.businessId, source: "ga4", externalId: ga4.externalId, status: "awaiting_setup", measurementId, detail: "Key events next", now });
    ga4 = { ...ga4, measurementId };
  }
  if (ga4.provisionedAt === null) {
    for (const event of KEY_EVENTS) await admin.createKeyEvent(ga4.externalId, event);
    await save({ businessId: candidate.businessId, source: "ga4", externalId: ga4.externalId, status: "awaiting_setup", provisionedAt: now, detail: "Tag off until the privacy answer is in", now });
    ga4 = { ...ga4, provisionedAt: now };
  }
  return ga4;
}

async function ensureSearchConsole(candidate: ProvisionCandidate, deps: ProvisionDeps): Promise<ProvisionResult> {
  const { verification, config, save, now } = deps;
  const siteUrl = siteUrlOf(candidate);
  let gsc = candidate.gsc;
  const changedSite = gsc !== null && gsc.externalId !== siteUrl;
  if (gsc === null || changedSite) {
    // A new domain starts over: the old history stays in the numbers tables, the new site is verified from the beginning.
    await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: "awaiting_setup", verifiedAt: null, provisionedAt: null, secondOwnerOk: false, detail: changedSite ? "New domain, verifying again" : "Verification tag next", now });
    gsc = { externalId: siteUrl, status: "awaiting_setup", measurementId: null, verifiedAt: null, provisionedAt: null, secondOwnerOk: false, detail: null };
  }
  const token = await verification.metaToken(siteUrl);
  if (gsc.verifiedAt === null) {
    if (!(await deps.pageShowsToken(candidate.hostname, token))) {
      const askedRecently = gsc.provisionedAt !== null && now.getTime() - gsc.provisionedAt.getTime() < TAG_WAIT_MS;
      if (!askedRecently) {
        await deps.setEnv(candidate, GSC_ENV, token);
        await deps.redeploy(candidate);
        await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: "awaiting_setup", provisionedAt: now, detail: "Waiting for the site to show the verification tag", now });
      }
      return "waiting";
    }
    if (!(await verification.verify(siteUrl))) {
      await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: "awaiting_setup", detail: "Google has not seen the tag yet", now });
      return "waiting";
    }
    await verification.addToSearchConsole(siteUrl);
    await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: "pending", verifiedAt: now, detail: null, now });
    gsc = { ...gsc, status: "pending", verifiedAt: now };
  }
  if (!gsc.secondOwnerOk) {
    if (config.secondOwnerEmail === null) {
      await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: gsc.status, detail: "No second owner is set", now });
      return "working";
    }
    const owners = [...new Set([config.mainAccountEmail, config.secondOwnerEmail].map((email) => email.toLowerCase()))];
    await verification.setOwners(siteUrl, owners);
    const listed = (await verification.owners(siteUrl)).map((email) => email.toLowerCase());
    const ok = listed.includes(config.secondOwnerEmail.toLowerCase());
    await save({ businessId: candidate.businessId, source: "gsc", externalId: siteUrl, status: gsc.status, secondOwnerOk: ok, detail: ok ? null : "Google did not list the second owner", now });
    if (!ok) return "working";
  }
  return "complete";
}

/** The Analytics tag goes on the site once the privacy answer is in: the id is set, the property starts being pulled, one redeploy. */
async function ensureAnalyticsTag(candidate: ProvisionCandidate, ga4: ProvisionSource, deps: ProvisionDeps): Promise<void> {
  if (!deps.config.analyticsTagEnabled || ga4.measurementId === null || ga4.status !== "awaiting_setup" || ga4.provisionedAt === null) return;
  await deps.setEnv(candidate, GA4_ENV, ga4.measurementId);
  await deps.redeploy(candidate);
  await deps.save({ businessId: candidate.businessId, source: "ga4", externalId: ga4.externalId, status: "pending", detail: null, now: deps.now });
}

export async function provisionOne(candidate: ProvisionCandidate, deps: ProvisionDeps): Promise<ProvisionOutcome> {
  const skipped = skipReason(candidate, deps.config);
  if (skipped !== null) return { businessId: candidate.businessId, result: "skipped", note: skipped };
  if (isComplete(candidate, deps.config)) return { businessId: candidate.businessId, result: "complete", note: null };
  try {
    const ga4 = await ensureAnalytics(candidate, deps);
    const result = await ensureSearchConsole(candidate, deps);
    await ensureAnalyticsTag(candidate, ga4, deps);
    return { businessId: candidate.businessId, result, note: null };
  } catch (error) {
    // The Brandbasket account was refused: every business would fail the same way, so the run stops and says so.
    if (error instanceof GoogleAccessLost) throw error;
    const failure = typeof error === "object" && error !== null && "failure" in error ? String((error as { failure: unknown }).failure) : "error";
    return { businessId: candidate.businessId, result: "error", note: failure };
  }
}

export async function provisionAll(candidates: readonly ProvisionCandidate[], deps: ProvisionDeps, pace: PaceOptions = {}): Promise<ProvisionOutcome[]> {
  // Businesses with nothing to do are settled at once, without the wait that spares Google's write caps.
  const work = candidates.filter((candidate) => skipReason(candidate, deps.config) === null && !isComplete(candidate, deps.config));
  const done = new Map((await mapPaced(work, (candidate) => provisionOne(candidate, deps), { ...pace, minGapMs: pace.minGapMs ?? BUSINESS_GAP_MS })).map((outcome) => [outcome.businessId, outcome] as const));
  return candidates.map((candidate) => done.get(candidate.businessId) ?? { businessId: candidate.businessId, result: skipReason(candidate, deps.config) === null ? "complete" : "skipped", note: skipReason(candidate, deps.config) });
}
