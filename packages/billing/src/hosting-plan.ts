/** What the hosting sync needs to know about one hosted website (docs/plans/57-site-lapse-hosting-enforcement.md). */
export interface HostedSiteState {
  readonly businessId: string;
  /** The project is paused at the host now. */
  readonly paused: boolean;
  /** The business has a project that reached `live`. */
  readonly hasLiveProject: boolean;
  /** What the billing rule says; null when the business's billing could not be read. */
  readonly billing: { readonly hasWebsite: boolean; readonly paymentUnderReview: boolean } | null;
}

export interface HostingAction {
  readonly businessId: string;
  readonly action: "pause" | "unpause";
}

/** Why a site that looks lapsed was left alone. A site whose billing could not be read is never touched either way. */
export interface HostingHold {
  readonly businessId: string;
  readonly reason: "not-launched" | "payment-under-review" | "billing-unreadable";
}

export interface HostingPlan {
  readonly actions: readonly HostingAction[];
  readonly held: readonly HostingHold[];
  /** More sites were due to be paused than one run may pause, so none were: that many at once looks like a fault. */
  readonly braked: boolean;
}

/** The most sites one run pauses, however large the fleet. */
const BRAKE_MAX_PAUSES = 10;
/** The share of live sites one run may pause (5%)... */
const BRAKE_FLEET_SHARE = 0.05;
/** ...but never fewer than this, so a small fleet is not braked by every single lapse. */
const BRAKE_MIN_PAUSES = 3;

function pauseLimit(liveSites: number): number {
  return Math.min(BRAKE_MAX_PAUSES, Math.max(BRAKE_MIN_PAUSES, Math.ceil(liveSites * BRAKE_FLEET_SHARE)));
}

/**
 * Decides which hosted websites to pause and unpause. The answer comes from the billing rule alone (`hasWebsite` is
 * hasWebsiteService); this only adds the guards around acting on it. Unpausing is always safe and is never braked.
 * Pausing is refused for a site that was never launched, for a payment waiting on staff, and for any site whose
 * billing could not be read, and if too many pauses are due at once none of them happens.
 */
export function planHostingActions(sites: readonly HostedSiteState[]): HostingPlan {
  const unpauses: HostingAction[] = [];
  const pauses: HostingAction[] = [];
  const held: HostingHold[] = [];

  for (const site of sites) {
    if (site.billing === null) {
      held.push({ businessId: site.businessId, reason: "billing-unreadable" });
    } else if (site.billing.hasWebsite) {
      if (site.paused) unpauses.push({ businessId: site.businessId, action: "unpause" });
    } else if (!site.paused) {
      if (!site.hasLiveProject) held.push({ businessId: site.businessId, reason: "not-launched" });
      else if (site.billing.paymentUnderReview) held.push({ businessId: site.businessId, reason: "payment-under-review" });
      else pauses.push({ businessId: site.businessId, action: "pause" });
    }
  }

  const limit = pauseLimit(sites.filter((site) => site.hasLiveProject).length);
  const braked = pauses.length > limit;
  return { actions: braked ? unpauses : [...pauses, ...unpauses], held, braked };
}
