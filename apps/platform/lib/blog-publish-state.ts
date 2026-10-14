/**
 * Where a post stands, as the dashboard shows it. A published post whose publish date is still ahead is "scheduled":
 * the site API leaves it out until that moment (lib/server/site-api.ts), so it goes live on its own.
 */
export type BlogPublishState = "draft" | "scheduled" | "published";

export function blogPublishState(
  status: "draft" | "published",
  publishedAt: number | null,
  now: number,
): BlogPublishState {
  if (status === "draft") return "draft";
  return publishedAt !== null && publishedAt > now ? "scheduled" : "published";
}

export const PUBLISH_STATE_LABELS: Readonly<Record<BlogPublishState, string>> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};
