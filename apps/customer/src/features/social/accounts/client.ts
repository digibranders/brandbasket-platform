import "server-only";
import { serverEnv } from "@/lib/env";
import { callPostingService, PostingServiceError, refusal } from "../posting-service";
import { readChannels, readConnectLink, type Channel } from "./rules";
import type { Platform } from "../analytics/rules";

/** Where the customer lands after pressing Allow on the network's own page. */
export const returnUrl = (): string => `${serverEnv().APP_ORIGIN}/social`;

/** The business's connected channels. A business that has no workspace yet has none. */
export async function fetchChannels(businessId: string, send: typeof fetch = fetch): Promise<Channel[]> {
  const answer = await callPostingService(`/api/v1/workspaces?externalId=${encodeURIComponent(businessId)}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the accounts");
  return readChannels(answer.body);
}

/** Makes the business's workspace if it has none (safe to repeat). */
export async function ensureWorkspace(business: { readonly id: string; readonly name: string; /** The business a further brand belongs to; left out for its first brand. */ readonly group?: string }, send: typeof fetch = fetch): Promise<void> {
  const answer = await callPostingService("/api/v1/workspaces", { method: "POST", body: { externalId: business.id, name: business.name, ...(business.group === undefined ? {} : { group: business.group }) } }, send);
  if (answer.status !== 200 && answer.status !== 201) throw refusal(answer, "the workspace");
}

/** A link the customer opens to press Allow on a network's own page. Valid for an hour. */
export async function fetchConnectLink(businessId: string, platform: Platform, returnUrl: string, send: typeof fetch = fetch): Promise<string> {
  const answer = await callPostingService("/api/v1/connect-link", { method: "POST", body: { externalId: businessId, channel: platform, returnUrl } }, send);
  if (answer.status !== 200) throw refusal(answer, "the connect link");
  const link = readConnectLink(answer.body);
  if (link === null) throw new PostingServiceError(answer.status, "the connect link", "it was not a safe address");
  return link;
}
