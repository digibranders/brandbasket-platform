import "server-only";
import { z } from "zod";
import { brandIdFor, readBrands, type BrandsView } from "@/lib/social/brands";
import { readBatches, readExpiredBatches, readFacts, readJob, readJobs, readPosters, readTopics, type ExpiredBatch, type FactsView, type Poster, type SiteJob, type Topic, type WrittenBatch } from "@/lib/social/ai";
import { readChannels, readConnectLink, readNotices, readPosts, readWebsite, type AutoChannel, type AutoPost, type ChannelPlatform, type WorkspaceNotice } from "@/lib/social/auto";

/**
 * The server-side client for social-auto, the service that writes and publishes the posts. Every call carries the product
 * key, so it must never be made from a browser. A business is a social-auto "workspace" named by its Brandbasket id, which
 * the service keeps for us: nothing is stored here to map one to the other.
 *
 * Switched off (every function answers "not configured") until SOCIAL_AUTO_URL and SOCIAL_AUTO_KEY are both set, so the
 * Social media page works as it always did without them. The guide for the API is docs/product-api.md in social-auto.
 */

const TIMEOUT_MS = 10_000;

const settingsSchema = z.object({
  SOCIAL_AUTO_URL: z.url({ error: "SOCIAL_AUTO_URL must be an absolute http(s) URL" }),
  SOCIAL_AUTO_KEY: z.string().min(16, "SOCIAL_AUTO_KEY must be at least 16 characters"),
  /** Where social-auto sends the customer back to after a network's Allow page. It must be one of the addresses registered for our key. */
  SOCIAL_AUTO_RETURN_URL: z.url({ error: "SOCIAL_AUTO_RETURN_URL must be an absolute http(s) URL" }),
});

export interface SocialAutoSettings {
  /** Where social-auto's product API starts, with any path it is served under (https://host or https://host/publisher), and no trailing slash. */
  readonly baseUrl: string;
  readonly key: string;
  readonly returnUrl: string;
}

/**
 * The settings, or null when social-auto is not set up here. Half set up (a URL without a key, a bad address) throws, so a
 * deployment that meant to turn it on finds out instead of silently losing the feature.
 */
export function socialAutoSettings(env: Readonly<Record<string, string | undefined>> = process.env): SocialAutoSettings | null {
  const url = env.SOCIAL_AUTO_URL?.trim();
  const key = env.SOCIAL_AUTO_KEY?.trim();
  const returnUrl = env.SOCIAL_AUTO_RETURN_URL?.trim();
  if (!url && !key && !returnUrl) return null;
  const parsed = settingsSchema.safeParse({ SOCIAL_AUTO_URL: url, SOCIAL_AUTO_KEY: key, SOCIAL_AUTO_RETURN_URL: returnUrl });
  if (!parsed.success) throw new Error(`Invalid social-auto configuration.\n${z.prettifyError(parsed.error)}`);
  return { baseUrl: baseUrlOf(parsed.data.SOCIAL_AUTO_URL), key: parsed.data.SOCIAL_AUTO_KEY, returnUrl: parsed.data.SOCIAL_AUTO_RETURN_URL };
}

/**
 * The address without a query, a fragment or a trailing slash. The path is kept: social-auto may be served under one
 * (https://social.example.com/publisher), and the API's own paths start after it.
 */
function baseUrlOf(address: string): string {
  const url = new URL(address);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export class SocialAutoError extends Error {
  readonly status: number | null;
  /** What the service said was wrong with the request, for a refusal the customer can fix (a 4xx); null otherwise. */
  readonly detail: string | null;
  /** The error's code (social-auto sends one with every error), which never changes, so the page can use its own words for it. */
  readonly code: string | null;

  constructor(message: string, status: number | null = null, detail: string | null = null, code: string | null = null) {
    super(message);
    this.name = "SocialAutoError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** One call. Never follows a redirect (the key must not travel anywhere else) and gives up after ten seconds. */
async function call(settings: SocialAutoSettings, path: string, init: { readonly method: "GET" | "POST" | "PATCH" | "DELETE"; readonly body?: unknown; readonly picture?: Uint8Array; readonly actor?: string }, send: typeof fetch): Promise<Answer> {
  let response: Response;
  try {
    response = await send(`${settings.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${settings.key}`,
        ...(init.actor === undefined ? {} : { "X-Social-Actor": init.actor }),
        ...(init.picture !== undefined ? { "Content-Type": "image/jpeg" } : init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.picture !== undefined ? { body: Buffer.from(init.picture) } : init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new SocialAutoError(`social-auto could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
}

const refusal = (answer: Answer, what: string): SocialAutoError => {
  const detail = (answer.body as { error?: unknown } | null)?.error;
  const said = typeof detail === "string" ? detail : null;
  const code = (answer.body as { code?: unknown } | null)?.code;
  return new SocialAutoError(`social-auto refused ${what} (${answer.status})${said === null ? "" : `: ${said}`}`, answer.status, answer.status >= 400 && answer.status < 500 ? said : null, typeof code === "string" ? code : null);
};

/** Makes the business's workspace if it has none (safe to repeat) and answers its connected channels. */
export async function ensureWorkspace(settings: SocialAutoSettings, business: { readonly id: string; readonly name: string; /** The business a further brand belongs to; left out for the business's own (first) brand. */ readonly group?: string }, send: typeof fetch = fetch): Promise<AutoChannel[]> {
  const answer = await call(settings, "/api/v1/workspaces", { method: "POST", body: { externalId: business.id, name: business.name, ...(business.group === undefined ? {} : { group: business.group }) } }, send);
  if (answer.status !== 200 && answer.status !== 201) throw refusal(answer, "the workspace");
  return readChannels(answer.body);
}

/** The business's brands and how many it may have, or null when the posting service does not answer for brands (an older one) or has no workspace for it yet. */
export async function loadBrands(settings: SocialAutoSettings, businessId: string, businessName: string, send: typeof fetch = fetch): Promise<BrandsView | null> {
  const answer = await call(settings, `/api/v1/workspaces?group=${encodeURIComponent(businessId)}`, { method: "GET" }, send);
  if (answer.status === 404 || answer.status === 400) return null;
  if (answer.status !== 200) throw refusal(answer, "the brands");
  return readBrands(answer.body, businessName);
}

/** Makes a further brand of the business: a workspace of its own in the business's group. The service refuses beyond what the business may have. */
export async function createBrand(settings: SocialAutoSettings, businessId: string, key: string, name: string, send: typeof fetch = fetch): Promise<void> {
  const answer = await call(settings, "/api/v1/workspaces", { method: "POST", body: { externalId: brandIdFor(businessId, key), name, group: businessId } }, send);
  if (answer.status !== 200 && answer.status !== 201) throw refusal(answer, "the new brand");
}

/** Archives a brand (nothing new is sent or drawn, and it frees a place) or brings it back. */
export async function archiveBrand(settings: SocialAutoSettings, externalId: string, archived: boolean, send: typeof fetch = fetch): Promise<void> {
  const answer = await call(settings, "/api/v1/workspaces/archive", { method: "POST", body: { externalId, archived } }, send);
  if (answer.status !== 200) throw refusal(answer, "the archive");
}

/** The business's connected channels. A business that has no workspace yet has none. */
export async function loadChannels(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<AutoChannel[]> {
  const answer = await call(settings, `/api/v1/workspaces?externalId=${encodeURIComponent(businessId)}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the channels");
  return readChannels(answer.body);
}

/** What the business's workspace says besides its channels: the website its first job locked it to (null before that), and any notices in plain words. */
export async function loadWorkspaceFacts(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<{ readonly website: string | null; readonly notices: WorkspaceNotice[] }> {
  const answer = await call(settings, `/api/v1/workspaces?externalId=${encodeURIComponent(businessId)}`, { method: "GET" }, send);
  if (answer.status === 404) return { website: null, notices: [] };
  if (answer.status !== 200) throw refusal(answer, "the workspace");
  return { website: readWebsite(answer.body), notices: readNotices(answer.body) };
}

/** The business's posts from `from` to `to` (`YYYY-MM-DD`, India time), earliest first. A business with no workspace has none. */
export async function loadPosts(settings: SocialAutoSettings, businessId: string, window: { readonly from: string; readonly to: string }, send: typeof fetch = fetch): Promise<AutoPost[]> {
  const query = new URLSearchParams({ externalId: businessId, from: window.from, to: window.to });
  const answer = await call(settings, `/api/v1/posts?${query}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the posts");
  return readPosts(answer.body);
}

/** A link the customer opens to press Allow on a network's own page. Valid for an hour. */
export async function connectLink(settings: SocialAutoSettings, businessId: string, platform: ChannelPlatform, send: typeof fetch = fetch): Promise<string> {
  const answer = await call(settings, "/api/v1/connect-link", { method: "POST", body: { externalId: businessId, channel: platform, returnUrl: settings.returnUrl } }, send);
  if (answer.status !== 200) throw refusal(answer, "the connect link");
  const link = readConnectLink(answer.body);
  if (link === null) throw new SocialAutoError("social-auto answered with a connect link that is not a safe address");
  return link;
}

/** Stores a picture for a post (a square JPG, up to 4 MB); answers the id to use when the post is made. */
export async function uploadPicture(settings: SocialAutoSettings, picture: Uint8Array, send: typeof fetch = fetch): Promise<string> {
  const answer = await call(settings, "/api/v1/pictures", { method: "POST", picture }, send);
  if (answer.status !== 201) throw refusal(answer, "the picture");
  const id = (answer.body as { pictureId?: unknown } | null)?.pictureId;
  if (typeof id !== "string" || id === "") throw new SocialAutoError("social-auto answered without a picture id");
  return id;
}

export interface NewPostRequest {
  readonly day: string;
  /** `HH:MM`, India time. */
  readonly time: string;
  readonly caption: string;
  readonly pictureId: string;
  readonly channels: readonly string[];
  /** Captions of their own for single networks. */
  readonly variants?: Readonly<Partial<Record<ChannelPlatform, string>>>;
}

/** The product API's shape of captions kept per network: `{ linkedin: { caption } }`, and `null` for a network put back on the main caption. */
function captionsOf(captions: Readonly<Partial<Record<ChannelPlatform, string | null>>>): Record<string, { caption: string } | null> {
  return Object.fromEntries(Object.entries(captions).map(([platform, caption]) => [platform, caption === null || caption === undefined ? null : { caption }]));
}

/** Sets a post for a day and time (India), to the chosen channels. */
export async function createPost(settings: SocialAutoSettings, businessId: string, post: NewPostRequest, send: typeof fetch = fetch): Promise<AutoPost> {
  const answer = await call(settings, "/api/v1/posts", { method: "POST", body: { externalId: businessId, day: post.day, time: post.time, caption: post.caption, pictureId: post.pictureId, channels: post.channels, ...(post.variants === undefined ? {} : { variants: captionsOf(post.variants) }) } }, send);
  if (answer.status !== 201) throw refusal(answer, "the post");
  const created = readPosts({ posts: [(answer.body as { post?: unknown } | null)?.post] })[0];
  if (created === undefined) throw new SocialAutoError("social-auto answered with a post that could not be read");
  return created;
}

export interface PostChanges {
  readonly day: string;
  readonly time: string;
  readonly caption: string;
  /** A new picture; left out keeps the one the post has. */
  readonly pictureId?: string;
  readonly channels: readonly string[];
  /** Each network's own caption, or null to put it back on the main caption. */
  readonly variants?: Readonly<Partial<Record<ChannelPlatform, string | null>>>;
}

/** Changes a post the business made, while it has not gone out. */
export async function updatePost(settings: SocialAutoSettings, businessId: string, postId: string, changes: PostChanges, send: typeof fetch = fetch): Promise<AutoPost> {
  const query = new URLSearchParams({ externalId: businessId, postId });
  const body = { day: changes.day, time: changes.time, caption: changes.caption, channels: changes.channels, ...(changes.pictureId === undefined ? {} : { pictureId: changes.pictureId }), ...(changes.variants === undefined ? {} : { variants: captionsOf(changes.variants) }) };
  const answer = await call(settings, `/api/v1/posts?${query}`, { method: "PATCH", body }, send);
  if (answer.status !== 200) throw refusal(answer, "the change");
  const updated = readPosts({ posts: [(answer.body as { post?: unknown } | null)?.post] })[0];
  if (updated === undefined) throw new SocialAutoError("social-auto answered with a post that could not be read");
  return updated;
}

/** Removes a post the business made, while it has not gone out. */
export async function deletePost(settings: SocialAutoSettings, businessId: string, postId: string, send: typeof fetch = fetch): Promise<void> {
  const query = new URLSearchParams({ externalId: businessId, postId });
  const answer = await call(settings, `/api/v1/posts?${query}`, { method: "DELETE" }, send);
  if (answer.status !== 200) throw refusal(answer, "the removal");
}

export interface SendResult {
  /** True when a channel refused the post; it stays due for 20 hours, so the next daily run tries again. */
  readonly failed: boolean;
  /** The accounts that refused it, for the customer to read. */
  readonly accounts: readonly string[];
}

const problemSchema = z.object({ account: z.string() });

/** Sends a post the business made right now, to its chosen accounts, instead of waiting for the daily run. */
export async function sendPostNow(settings: SocialAutoSettings, businessId: string, postId: string, send: typeof fetch = fetch): Promise<SendResult> {
  const answer = await call(settings, "/api/v1/send", { method: "POST", body: { externalId: businessId, postId } }, send);
  if (answer.status !== 200) throw refusal(answer, "the send");
  const body = answer.body as { failed?: unknown; problems?: unknown } | null;
  const problems = Array.isArray(body?.problems) ? body.problems.flatMap((item): string[] => { const parsed = problemSchema.safeParse(item); return parsed.success ? [parsed.data.account] : []; }) : [];
  return { failed: body?.failed === true, accounts: [...new Set(problems)] };
}

/** Moves a post the business made to another day and time, leaving everything else as it is. */
export async function movePost(settings: SocialAutoSettings, businessId: string, postId: string, to: { readonly day: string; readonly time: string }, send: typeof fetch = fetch): Promise<AutoPost> {
  const query = new URLSearchParams({ externalId: businessId, postId });
  const answer = await call(settings, `/api/v1/posts?${query}`, { method: "PATCH", body: { day: to.day, time: to.time } }, send);
  if (answer.status !== 200) throw refusal(answer, "the move");
  const moved = readPosts({ posts: [(answer.body as { post?: unknown } | null)?.post] })[0];
  if (moved === undefined) throw new SocialAutoError("social-auto answered with a post that could not be read");
  return moved;
}

/**
 * The person who decides, as social-auto records them: our business id and the signed-in person's id. social-auto trusts this
 * (it cannot check it), so it is always built on the server from the session, never taken from a form.
 */
export const actorOf = (tenant: { readonly businessId: string; readonly userId: string }): string => `brandbasket:${tenant.userId}`.slice(0, 64);

/** Starts a batch of written posts from the customer's website (or one page of it). Nothing is drawn or paid for yet. */
export async function startSiteJob(
  settings: SocialAutoSettings,
  businessId: string,
  request: { readonly site: string; readonly page: boolean; readonly networks?: readonly ChannelPlatform[] },
  actor: string,
  send: typeof fetch = fetch,
): Promise<{ readonly job: SiteJob; readonly created: boolean }> {
  const body = { externalId: businessId, site: request.site, ...(request.page ? { page: true } : {}), ...(request.networks === undefined || request.networks.length === 0 ? {} : { networks: request.networks }) };
  const answer = await call(settings, "/api/v1/site-jobs", { method: "POST", body, actor }, send);
  if (answer.status !== 200 && answer.status !== 202) throw refusal(answer, "the website job");
  const started = readJob(answer.body);
  if (started === null) throw new SocialAutoError("social-auto answered with a job that could not be read");
  return started;
}

/** The customer's jobs, newest first. A 404 reads as none yet. */
export async function loadSiteJobs(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<SiteJob[]> {
  const answer = await call(settings, `/api/v1/site-jobs?${new URLSearchParams({ externalId: businessId })}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the jobs");
  return readJobs(answer.body);
}

/** The facts found on the customer's website, or null before the website has been read. */
export async function loadFacts(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<FactsView | null> {
  const answer = await call(settings, `/api/v1/facts?${new URLSearchParams({ externalId: businessId })}`, { method: "GET" }, send);
  if (answer.status === 404) return null;
  if (answer.status !== 200) throw refusal(answer, "the facts");
  return readFacts(answer.body);
}

/** Confirms, removes or puts back one fact; answers the facts as they are now. */
export async function decideFact(settings: SocialAutoSettings, businessId: string, factId: string, action: "confirm" | "remove" | "restore", actor: string, send: typeof fetch = fetch): Promise<FactsView> {
  const answer = await call(settings, "/api/v1/facts", { method: "POST", body: { externalId: businessId, factId, action }, actor }, send);
  if (answer.status !== 200) throw refusal(answer, "the fact");
  const facts = readFacts(answer.body);
  if (facts === null) throw new SocialAutoError("social-auto answered with facts that could not be read");
  return facts;
}

/** The written posts still waiting for the customer's choice. */
export async function loadBatches(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<{ readonly batches: WrittenBatch[]; readonly expired: ExpiredBatch[] }> {
  const answer = await call(settings, `/api/v1/batches?${new URLSearchParams({ externalId: businessId })}`, { method: "GET" }, send);
  if (answer.status === 404) return { batches: [], expired: [] };
  if (answer.status !== 200) throw refusal(answer, "the written posts");
  return { batches: readBatches(answer.body), expired: readExpiredBatches(answer.body) };
}

/** Each post idea and which of the customer's connected networks it lacks. A business with no workspace has none. */
export async function loadTopics(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<Topic[]> {
  const answer = await call(settings, `/api/v1/topics?${new URLSearchParams({ externalId: businessId })}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the topics");
  return readTopics(answer.body);
}

/** Writes the posts of one batch for one more network, from the same topics. The words are written by a job the page then follows. */
export async function addNetwork(settings: SocialAutoSettings, businessId: string, batchId: string, network: ChannelPlatform, actor: string, send: typeof fetch = fetch): Promise<SiteJob> {
  const answer = await call(settings, "/api/v1/batches", { method: "POST", body: { externalId: businessId, batchId, action: "add-network", network }, actor }, send);
  if (answer.status !== 200 && answer.status !== 202) throw refusal(answer, "the new network");
  const job = readJob(answer.body)?.job;
  if (job === undefined) throw new SocialAutoError("social-auto answered with a job that could not be read");
  return job;
}

export type BatchChange =
  | { readonly action: "keep" | "drop"; readonly postId: string }
  | { readonly action: "edit"; readonly postId: string; readonly headline?: string; readonly caption?: string; readonly network?: ChannelPlatform }
  | { readonly action: "close" };

/** One choice on a batch of written posts. Answers the batch as it is now. */
export async function decideBatch(settings: SocialAutoSettings, businessId: string, batchId: string, change: BatchChange, actor: string, send: typeof fetch = fetch): Promise<WrittenBatch> {
  const answer = await call(settings, "/api/v1/batches", { method: "POST", body: { externalId: businessId, batchId, ...change }, actor }, send);
  if (answer.status !== 200) throw refusal(answer, "the written posts");
  const batch = readBatches({ batches: [(answer.body as { batch?: unknown } | null)?.batch], networkRules: (answer.body as { networkRules?: unknown } | null)?.networkRules })[0];
  if (batch === undefined) throw new SocialAutoError("social-auto answered with a batch that could not be read");
  return batch;
}

/** Asks for pictures for the kept posts of a batch. This is what costs money, so social-auto limits it; once per batch. */
export async function drawBatch(settings: SocialAutoSettings, businessId: string, batchId: string, actor: string, send: typeof fetch = fetch): Promise<{ readonly job: SiteJob; readonly created: boolean }> {
  const answer = await call(settings, "/api/v1/batches", { method: "POST", body: { externalId: businessId, batchId, action: "draw" }, actor }, send);
  if (answer.status !== 200 && answer.status !== 202) throw refusal(answer, "the pictures");
  const started = readJob(answer.body);
  if (started === null) throw new SocialAutoError("social-auto answered with a job that could not be read");
  return started;
}

/** The pictures waiting for the customer (`open`: waiting, plus any that need confirming again) or already decided. */
export async function loadPosters(settings: SocialAutoSettings, businessId: string, status: "open" | "approved" | "expired" | "all" = "open", send: typeof fetch = fetch): Promise<{ readonly posters: Poster[]; readonly reasons: string[] }> {
  const answer = await call(settings, `/api/v1/posters?${new URLSearchParams({ externalId: businessId, status })}`, { method: "GET" }, send);
  if (answer.status === 404) return { posters: [], reasons: [] };
  if (answer.status !== 200) throw refusal(answer, "the pictures");
  return readPosters(answer.body);
}

export type PosterDecision =
  | { readonly action: "approve" | "withdraw" | "redraw"; readonly id: string }
  | { readonly action: "reject"; readonly id: string; readonly reason: string; readonly comment?: string }
  | { readonly action: "approve-topic"; readonly batchId: string; readonly postId: string }
  /** New words for one network's picture: a new version of the same picture that the customer approves again. */
  | { readonly action: "change-words"; readonly id: string; readonly caption: string };

/** The customer's decision on a picture, or on every network's picture of one topic. The answer is social-auto's, as it stands. */
export async function decidePoster(settings: SocialAutoSettings, businessId: string, decision: PosterDecision, actor: string, send: typeof fetch = fetch): Promise<{ readonly job: SiteJob | null; readonly waitingForRelease: boolean; readonly postStopped: boolean }> {
  const answer = await call(settings, "/api/v1/posters", { method: "POST", body: { externalId: businessId, ...decision }, actor }, send);
  if (answer.status !== 200 && answer.status !== 202) throw refusal(answer, "the picture");
  const flags = answer.body as { waitingForRelease?: unknown; postStopped?: unknown } | null;
  return { job: readJob(answer.body)?.job ?? null, waitingForRelease: flags?.waitingForRelease === true, postStopped: flags?.postStopped === true };
}

/** One picture's JPEG bytes, or null when social-auto has no such picture for this customer. The service's own key is used, so it is for a route that checks the session first. */
export async function fetchPosterImage(settings: SocialAutoSettings, businessId: string, posterId: string, send: typeof fetch = fetch): Promise<Uint8Array | null> {
  let response: Response;
  try {
    response = await send(`${settings.baseUrl}/api/v1/posters?${new URLSearchParams({ externalId: businessId, id: posterId, image: "1" })}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${settings.key}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new SocialAutoError(`social-auto could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (response.status === 404) return null;
  if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) throw new SocialAutoError(`social-auto refused the picture (${response.status})`, response.status);
  return new Uint8Array(await response.arrayBuffer());
}
