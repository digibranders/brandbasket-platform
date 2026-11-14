import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { brandOf } from "@/features/social/brand";
import type { ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { groupReview } from "@/legacy-social/lib/social/review-cards";
import { channelTodoCounts } from "@/legacy-social/lib/social/review-flow";
import { loadBatches, loadPosters, loadTopicRequests, loadTopics, socialAutoSettings } from "./social-auto";

/**
 * What each channel has waiting for the customer (topics to decide, pictures to approve), for the number beside its name on the Calendar and
 * Analytics pages, as the Posts page shows it. It asks the posting service again, so a failed read leaves the numbers off: no number is
 * better than a wrong one, and a page never fails because of it.
 */
export async function loadChannelTodos(customer: Pick<CustomerContext, "businessId" | "businessName">, platforms: readonly ChannelPlatform[]): Promise<Partial<Record<ChannelPlatform, number>>> {
  if (platforms.length === 0) return {};
  const settings = socialAutoSettings();
  if (settings === null) return {};
  try {
    const brand = await brandOf(customer);
    const id = brand.externalId;
    const [written, pictures, topics, requests] = await Promise.all([loadBatches(settings, id), loadPosters(settings, id, "all"), loadTopics(settings, id), loadTopicRequests(settings, id)]);
    // The same picture and own-topic rules as the review page, so the number is the one the Posts page shows.
    const own = new Set(requests.flatMap((request) => (request.batchId === null ? [] : [request.batchId])));
    const shown = pictures.posters.filter((poster) => poster.status === "pending" || poster.status === "held" || poster.status === "blocked" || poster.status === "approved" || ((poster.status === "rejected" || poster.status === "expired") && poster.canRedraw));
    const groups = groupReview(
      written.batches.filter((batch) => !own.has(batch.id)),
      shown.filter((poster) => !own.has(poster.batchId)),
      topics.filter((topic) => !own.has(topic.batchId)),
    );
    return channelTodoCounts(groups, platforms);
  } catch (error) {
    reportError(error, { area: "social.channel-todos" });
    return {};
  }
}
