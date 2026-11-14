import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { reportError } from "@/lib/report";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { brandOf, type SocialBrand } from "@/features/social/brand";
import type { BatchPlan, ExpiredBatch, Poster, SiteJob, Topic, TopicRequest, WrittenBatch } from "@/legacy-social/lib/social/ai";
import type { CarouselDetail, CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import type { AutoPostingState } from "@/legacy-social/lib/social/auto-posting";
import { renewalDay } from "@/legacy-social/lib/social/plan-window";
import { addableNetworks, type PostingDays } from "@/legacy-social/lib/social/schedule";
import { loadAutoPosting, loadBatches, loadCarousel, loadCarouselList, loadChannels, loadPictureLimits, loadPosters, loadSchedule, loadSiteJobs, loadTopicRequests, loadTopics, loadWorkspaceFacts, socialAutoSettings, type PictureLimits } from "./social-auto";

/** Everything the review page shows: the customer's batches of written posts and where they stand, and the pictures. */
export interface SocialReview {
  readonly jobs: readonly SiteJob[];
  readonly batches: readonly WrittenBatch[];
  /** The pictures waiting for the customer, plus any that need confirming again. */
  readonly waiting: readonly Poster[];
  readonly approved: readonly Poster[];
  /** The topics she wrote in her own words, newest first. */
  readonly topicRequests: readonly TopicRequest[];
  /** What was put away because nobody decided within 14 days, so the customer is told. */
  readonly expired: { readonly batches: readonly ExpiredBatch[]; readonly pictures: readonly Poster[] };
  /** The connected networks some post idea has no version for yet, so the customer can ask for them. */
  readonly missingNetworks: readonly ChannelPlatform[];
  /** The days each channel posts on, for the topics step; null when the posting service cannot say, so no choice is offered. */
  readonly postingDays: PostingDays | null;
  /** Which channels the system posts for by itself; null when the posting service has no automatic posting. */
  readonly autoPosting: AutoPostingState;
  /** Where her month stands (the next month, when it can start); null when the posting service does not say. */
  readonly plan: BatchPlan | null;
  /** The website her posts are written from, once there is one. */
  readonly website: string | null;
  /** Each topic with where every channel's picture of it stands. */
  readonly topics: readonly Topic[];
  readonly reasons: readonly string[];
  /** How many pictures each channel has left this week; null when the posting service does not report it. */
  readonly limits: PictureLimits | null;
  /** The connected accounts, one for each network, for the channels down the side of the page. */
  readonly channels: readonly { readonly platform: ChannelPlatform; readonly account: string }[];
  /** The customer's carousels, newest first, and the newest one in full (its slides and the words for each channel); empty and null when there is none. */
  readonly carousels: readonly CarouselSummary[];
  readonly carousel: CarouselDetail | null;
  /** Whether a carousel is made for the customer every week, by itself. */
  readonly weeklyCarousel: boolean;
  /** Whether a carousel can be asked for now: the website was read, and at least one account is connected. */
  readonly canMakeCarousel: boolean;
  /** The brand being looked at and all the business's brands, for the switcher. */
  readonly brand?: SocialBrand;
  /** The day (India time, `YYYY-MM-DD`) the paid period runs out and the plan renews; null when it is not known. The next month starts on it. */
  readonly renewsOn: string | null;
  /** True when social-auto could not be asked, so the page says so instead of showing nothing as if it were true. */
  readonly unavailable: boolean;
}

const EMPTY: SocialReview = { jobs: [], batches: [], waiting: [], approved: [], channels: [], topicRequests: [], expired: { batches: [], pictures: [] }, missingNetworks: [], postingDays: null, autoPosting: null, plan: null, website: null, topics: [], reasons: [], limits: null, carousels: [], carousel: null, weeklyCarousel: false, canMakeCarousel: false, renewsOn: null, unavailable: true };

/** Asks social-auto for each part. Each is its own failure: what could be read is shown, and the page says the rest could not be. */
export async function loadSocialReview(customer: Pick<CustomerContext, "businessId" | "businessName" | "billing">): Promise<SocialReview> {
  const settings = socialAutoSettings();
  if (settings === null) return EMPTY;
  const brand = await brandOf(customer);
  const id = brand.externalId;
  let failed = false;
  const read = async <T>(label: string, fallback: T, work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      failed = true;
      reportError(error, { area: `social.review.${label}` });
      return fallback;
    }
  };
  // One read of every picture: the "open" filter leaves out one that did not pass the checks, which the customer must still see.
  const [jobs, written, pictures, topics, limits, carouselList, facts, channels, topicRequests, postingDays, autoPosting] = await Promise.all([
    read("the jobs", [] as SiteJob[], () => loadSiteJobs(settings, id)),
    read("the written posts", { batches: [] as WrittenBatch[], expired: [] as ExpiredBatch[], plan: null as BatchPlan | null }, () => loadBatches(settings, id)),
    read("the pictures", { posters: [] as Poster[], reasons: [] as string[] }, () => loadPosters(settings, id, "all")),
    read("the topics", [] as Topic[], () => loadTopics(settings, id)),
    read("the picture limits", null as PictureLimits | null, () => loadPictureLimits(settings, id)),
    read("the carousels", { carousels: [] as CarouselSummary[], weekly: false }, () => loadCarouselList(settings, id)),
    read("the website", { website: null as string | null, notices: [] }, () => loadWorkspaceFacts(settings, id)),
    read("the channels", [] as Awaited<ReturnType<typeof loadChannels>>, () => loadChannels(settings, id)),
    read("her own topics", [] as TopicRequest[], () => loadTopicRequests(settings, id)),
    read("the posting days", null as PostingDays | null, () => loadSchedule(settings, id)),
    read("automatic posting", null as AutoPostingState, () => loadAutoPosting(settings, id)),
  ]);
  const carousels = carouselList.carousels;
  const newest = carousels[0];
  const carousel = newest === undefined ? null : await read("the carousel", null as CarouselDetail | null, () => loadCarousel(settings, id, newest.id));
  return {
    jobs,
    batches: written.batches,
    // A picture the customer put away (sent back, or an approval taken back) stays here while one more can still be drawn.
    waiting: pictures.posters.filter((poster) => poster.status === "pending" || poster.status === "held" || poster.status === "blocked" || ((poster.status === "rejected" || poster.status === "expired") && poster.canRedraw)),
    approved: pictures.posters.filter((poster) => poster.status === "approved"),
    expired: { batches: written.expired, pictures: pictures.posters.filter((poster) => poster.status === "expired") },
    brand,
    channels: CHANNEL_PLATFORMS.flatMap((platform) => {
      const found = channels.find((channel) => channel.platform === platform);
      return found === undefined ? [] : [{ platform, account: found.account }];
    }),
    topicRequests,
    missingNetworks: addableNetworks(topics, written.batches, postingDays),
    postingDays,
    autoPosting,
    plan: written.plan,
    website: facts.website,
    topics,
    reasons: pictures.reasons,
    limits,
    carousels,
    carousel,
    weeklyCarousel: carouselList.weekly,
    canMakeCarousel: facts.website !== null && channels.length > 0,
    renewsOn: renewalDay(customer.billing.subscription?.paidThroughAt ?? null, (at) => localDateIn(BRAND_TIME_ZONE, at)),
    unavailable: failed,
  };
}
