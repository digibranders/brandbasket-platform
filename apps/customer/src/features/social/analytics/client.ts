import "server-only";
import { callPostingService, PostingServiceError, refusal } from "../posting-service";
import { readAnalytics, type Analytics } from "./rules";

export { PostingServiceError };

/**
 * One read of how a workspace's posts and accounts did, from `from` to `to` (UTC days, inclusive). Null when the service has
 * nothing to give yet: no workspace for the business (404) or analytics not switched on (503). The business is the workspace
 * id the service already keeps for it, so this never takes an id from the browser.
 */
export async function fetchAnalytics(externalId: string, window: { readonly from: string; readonly to: string }, send: typeof fetch = fetch): Promise<Analytics | null> {
  const query = new URLSearchParams({ externalId, from: window.from, to: window.to });
  const answer = await callPostingService(`/api/v1/analytics?${query}`, { method: "GET" }, send);
  if (answer.status === 404 || answer.status === 503) return null;
  if (answer.status !== 200) throw refusal(answer, "the analytics");
  return readAnalytics(answer.body);
}
