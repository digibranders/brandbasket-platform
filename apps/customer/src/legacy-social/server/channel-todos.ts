import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { brandOf } from "@/features/social/brand";
import type { ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { groupReview } from "@/legacy-social/lib/social/review-cards";
import { channelActivity, type ChannelState } from "@/legacy-social/lib/social/channel-activity";
import { channelTodoCounts } from "@/legacy-social/lib/social/review-flow";
import { loadBatches, loadPosters, loadSiteJobs, loadTopicRequests, loadTopics, socialAutoSettings } from "./social-auto";

const NO_STATE = (brandId: string): ChannelState => ({ brandId, todos: {}, working: [], doneAt: {} });

/**
 * What each channel has waiting for the customer (topics to decide, pictures to approve) and whether something is being written for it,
 * for the number and the working line beside its name on the Calendar and Analytics pages, as the Posts page shows them. It asks the
 * posting service again, so a failed read leaves them off: nothing is better than something wrong, and a page never fails because of it.
 */
export async function loadChannelState(customer: Pick<CustomerContext, "businessId" | "businessName">, platforms: readonly ChannelPlatform[]): Promise<ChannelState> {
  if (platforms.length === 0) return NO_STATE(customer.businessId);
  const settings = socialAutoSettings();
  if (settings === null) return NO_STATE(customer.businessId);
  try {
    const brand = await brandOf(customer);
    const id = brand.externalId;
    const [written, pictures, topics, requests, jobs] = await Promise.all([loadBatches(settings, id), loadPosters(settings, id, "all"), loadTopics(settings, id), loadTopicRequests(settings, id), loadSiteJobs(settings, id)]);
    // The same picture and own-topic rules as the review page, so the number is the one the Posts page shows.
    const own = new Set(requests.flatMap((request) => (request.batchId === null ? [] : [request.batchId])));
    const shown = pictures.posters.filter((poster) => poster.status === "pending" || poster.status === "held" || poster.status === "blocked" || poster.status === "approved" || ((poster.status === "rejected" || poster.status === "expired") && poster.canRedraw));
    const groups = groupReview(
      written.batches.filter((batch) => !own.has(batch.id)),
      shown.filter((poster) => !own.has(poster.batchId)),
      topics.filter((topic) => !own.has(topic.batchId)),
    );
    const activity = channelActivity(jobs, platforms, (batchId) => written.batches.find((batch) => batch.id === batchId)?.networks);
    return { brandId: id, todos: channelTodoCounts(groups, platforms), working: [...activity.working], doneAt: { ...activity.doneAt } };
  } catch (error) {
    reportError(error, { area: "social.channel-todos" });
    return NO_STATE(customer.businessId);
  }
}

/** Just the numbers, for a page that shows no working line. */
export async function loadChannelTodos(customer: Pick<CustomerContext, "businessId" | "businessName">, platforms: readonly ChannelPlatform[]): Promise<Partial<Record<ChannelPlatform, number>>> {
  return (await loadChannelState(customer, platforms)).todos;
}
