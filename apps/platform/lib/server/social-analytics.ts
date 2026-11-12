import "server-only";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { windowsOf, type Analytics, type Range } from "@/lib/social/analytics";
import { quietly } from "./quietly";
import { socialBrand, type SocialBrand } from "./social-brand";
import { loadAnalytics, socialAutoSettings } from "./social-auto";

/** What the Analytics page shows for the brand being looked at. */
export interface SocialAnalytics {
  readonly brand: SocialBrand;
  readonly range: Range;
  /** The days of the range ending today and of the range before it (oldest first), as UTC calendar days, which is how the networks count them. */
  readonly days: { readonly current: readonly string[]; readonly previous: readonly string[] };
  /** The numbers, or null when the posting service could not give any: the page then says so. */
  readonly analytics: Analytics | null;
  /** True when the posting service could not be asked, as opposed to having nothing yet. */
  readonly unavailable: boolean;
}

/**
 * Asks social-auto how the brand's posts and accounts did over the range and the range before it, in one read. The brand is the one the
 * customer chose; a failed or missing answer leaves the page to say the numbers are not available, never to show zeros as if they were true.
 */
export async function loadSocialAnalytics(tenant: TenantContext, now: Date, range: Range): Promise<SocialAnalytics> {
  const brand = await socialBrand(tenant);
  const windows = windowsOf(range, now.toISOString().slice(0, 10));
  const days = { current: windows.current, previous: windows.previous };
  const settings = await quietly("social", "the social-auto settings", null, async () => socialAutoSettings());
  if (settings === null) return { brand, range, days, analytics: null, unavailable: true };
  let failed = false;
  const analytics = await quietly("social", "the analytics", null as Analytics | null, async () => {
    try {
      return await loadAnalytics(settings, brand.externalId, { from: windows.from, to: windows.current[windows.current.length - 1] ?? windows.from });
    } catch (error) {
      failed = true;
      throw error;
    }
  });
  return { brand, range, days, analytics, unavailable: failed };
}
