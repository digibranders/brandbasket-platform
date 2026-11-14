import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { brandOf, type SocialBrand } from "@/features/social/brand";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { loadWindow, toCalendarPost, type AutoChannel, type ChannelPlatform, type CalendarPost, type WorkspaceNotice } from "@/legacy-social/lib/social/auto";
import type { BatchPlan, SiteJob } from "@/legacy-social/lib/social/ai";
import type { AutoPostingState } from "@/legacy-social/lib/social/auto-posting";
import type { PostingDays } from "@/legacy-social/lib/social/schedule";
import { loadBatches, loadChannels, loadAutoPosting, loadPosters, loadPosts, loadSchedule, loadSiteJobs, loadWorkspaceFacts, socialAutoSettings } from "./social-auto";

/** What the old Social media page shows from the posting service: the connected channels and the posts it writes and publishes. */
export interface LegacySocialData {
  readonly businessName: string;
  /** The brand being looked at, with all the business's brands for the switcher. */
  readonly brand: SocialBrand;
  readonly channels: readonly AutoChannel[];
  /** What the workspace says in plain words, such as posts on hold because an account was disconnected. */
  readonly notices: readonly WorkspaceNotice[];
  readonly posts: readonly CalendarPost[];
  /** The days each channel posts on; null when the posting service cannot say (an older one), so the page offers no choice. */
  readonly postingDays: PostingDays | null;
  /** The channels the system posts for by itself; null when the posting service has no automatic posting, so the page offers no choice. */
  readonly autoPosting: AutoPostingState;
  /** Today in India, `YYYY-MM-DD`. */
  readonly today: string;
  /** The AI side: the jobs that write the posts, and what was put away because nobody decided in time. */
  readonly ai: {
    readonly jobs: readonly SiteJob[];
    /** The website the brand is locked to, or null before its first job. */
    readonly website: string | null;
    /** True when the jobs could not be read, so "no jobs" would not be true and the page must not invite a start. */
    readonly jobsUnavailable: boolean;
    readonly expired: { readonly batches: number; readonly pictures: number };
    /** Where the customer's month stands, or null when the posting service does not say. */
    readonly plan: BatchPlan | null;
    /** The channels a written batch of her website's posts is for (her own one-post topics do not count). */
    readonly covered: readonly ChannelPlatform[];
  };
  /** True when the posting service could not be asked, so the page says so instead of showing an empty calendar as if it were true. */
  readonly unavailable: boolean;
}

/**
 * Asks the posting service for the channels, the posts and the workspace notices. Each read is its own failure: one that fails leaves
 * that part out, the page says the rest could not be read, and the failure goes to Sentry. Null when this server has no posting service.
 */
export async function loadLegacySocial(customer: Pick<CustomerContext, "businessId" | "businessName">, now: Date): Promise<LegacySocialData | null> {
  const settings = socialAutoSettings();
  if (settings === null) return null;
  const brand = await brandOf(customer);
  const today = localDateIn(BRAND_TIME_ZONE, now);
  const [channels, posts, facts, jobs, written, expiredPictures, schedule, auto] = await Promise.allSettled([
    loadChannels(settings, brand.externalId),
    loadPosts(settings, brand.externalId, loadWindow(today)),
    loadWorkspaceFacts(settings, brand.externalId),
    loadSiteJobs(settings, brand.externalId),
    loadBatches(settings, brand.externalId),
    loadPosters(settings, brand.externalId, "expired"),
    loadSchedule(settings, brand.externalId),
    loadAutoPosting(settings, brand.externalId),
  ]);
  for (const outcome of [channels, posts, facts, jobs, written, expiredPictures, schedule, auto]) if (outcome.status === "rejected") reportError(outcome.reason, { area: "social.posting-service" });
  return {
    businessName: brand.name,
    brand,
    channels: channels.status === "fulfilled" ? channels.value : [],
    notices: facts.status === "fulfilled" ? facts.value.notices : [],
    posts: posts.status === "fulfilled" ? posts.value.flatMap((post) => toCalendarPost(post) ?? []) : [],
    autoPosting: auto.status === "fulfilled" ? auto.value : null,
    postingDays: schedule.status === "fulfilled" ? schedule.value : null,
    today,
    // A failed read of the jobs shows as none yet: the page still draws, and Sentry has the reason.
    ai: {
      jobs: jobs.status === "fulfilled" ? jobs.value : [],
      website: facts.status === "fulfilled" ? facts.value.website : null,
      jobsUnavailable: jobs.status === "rejected",
      plan: written.status === "fulfilled" ? written.value.plan : null,
      covered: written.status === "fulfilled" ? [...new Set(written.value.batches.filter((batch) => batch.posts.length > 1).flatMap((batch) => batch.networks))] : [],
      expired: { batches: written.status === "fulfilled" ? written.value.expired.length : 0, pictures: expiredPictures.status === "fulfilled" ? expiredPictures.value.posters.length : 0 },
    },
    unavailable: channels.status === "rejected" || posts.status === "rejected",
  };
}
