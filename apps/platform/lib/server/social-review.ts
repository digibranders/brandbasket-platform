import "server-only";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { ExpiredBatch, Poster, SiteJob, Topic, WrittenBatch } from "@/lib/social/ai";
import type { ChannelPlatform } from "@/lib/social/auto";
import { loadBatches, loadPosters, loadSiteJobs, loadTopics, socialAutoSettings } from "./social-auto";
import { quietly } from "./quietly";
import { socialBrand, type SocialBrand } from "./social-brand";

/** Everything the review page shows: the customer's batches of written posts and where they stand, and the pictures. */
export interface SocialReview {
  readonly jobs: readonly SiteJob[];
  readonly batches: readonly WrittenBatch[];
  /** The pictures waiting for the customer, plus any that need confirming again. */
  readonly waiting: readonly Poster[];
  readonly approved: readonly Poster[];
  /** What was put away because nobody decided within 14 days, so the customer is told. */
  readonly expired: { readonly batches: readonly ExpiredBatch[]; readonly pictures: readonly Poster[] };
  /** The connected networks some post idea has no version for yet, so the customer can ask for them. */
  readonly missingNetworks: readonly ChannelPlatform[];
  readonly reasons: readonly string[];
  /** The brand being looked at and all the business's brands, for the switcher. */
  readonly brand?: SocialBrand;
  /** True when social-auto could not be asked, so the page says so instead of showing nothing as if it were true. */
  readonly unavailable: boolean;
}

const EMPTY: SocialReview = { jobs: [], batches: [], waiting: [], approved: [], expired: { batches: [], pictures: [] }, missingNetworks: [], reasons: [], unavailable: true };

/** Asks social-auto for each part. Each is its own failure: what could be read is shown, and the page says the rest could not be. */
export async function loadSocialReview(tenant: TenantContext): Promise<SocialReview> {
  const settings = await quietly("social", "the social-auto settings", null, async () => socialAutoSettings());
  if (settings === null) return EMPTY;
  const brand = await socialBrand(tenant);
  const id = brand.externalId;
  let failed = false;
  const read = <T>(label: string, fallback: T, work: () => Promise<T>): Promise<T> =>
    quietly("social", label, fallback, async () => {
      try {
        return await work();
      } catch (error) {
        failed = true;
        throw error;
      }
    });
  // One read of every picture: the "open" filter leaves out one that did not pass the checks, which the customer must still see.
  const [jobs, written, pictures, topics] = await Promise.all([
    read("the jobs", [] as SiteJob[], () => loadSiteJobs(settings, id)),
    read("the written posts", { batches: [] as WrittenBatch[], expired: [] as ExpiredBatch[] }, () => loadBatches(settings, id)),
    read("the pictures", { posters: [] as Poster[], reasons: [] as string[] }, () => loadPosters(settings, id, "all")),
    read("the topics", [] as Topic[], () => loadTopics(settings, id)),
  ]);
  return {
    jobs,
    batches: written.batches,
    // A picture the customer put away (sent back, or an approval taken back) stays here while one more can still be drawn.
    waiting: pictures.posters.filter((poster) => poster.status === "pending" || poster.status === "held" || poster.status === "blocked" || ((poster.status === "rejected" || poster.status === "expired") && poster.canRedraw)),
    approved: pictures.posters.filter((poster) => poster.status === "approved"),
    expired: { batches: written.expired, pictures: pictures.posters.filter((poster) => poster.status === "expired") },
    brand,
    missingNetworks: [...new Set(topics.flatMap((topic) => topic.missing))],
    reasons: pictures.reasons,
    unavailable: failed,
  };
}
