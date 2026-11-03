import "server-only";
import { z } from "zod";
import { readChannels, readConnectLink, readPosts, type AutoChannel, type AutoPost, type ChannelPlatform } from "@/lib/social/auto";

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

  constructor(message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = "SocialAutoError";
    this.status = status;
    this.detail = detail;
  }
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** One call. Never follows a redirect (the key must not travel anywhere else) and gives up after ten seconds. */
async function call(settings: SocialAutoSettings, path: string, init: { readonly method: "GET" | "POST" | "PATCH" | "DELETE"; readonly body?: unknown; readonly picture?: Uint8Array }, send: typeof fetch): Promise<Answer> {
  let response: Response;
  try {
    response = await send(`${settings.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${settings.key}`,
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
  return new SocialAutoError(`social-auto refused ${what} (${answer.status})${said === null ? "" : `: ${said}`}`, answer.status, answer.status >= 400 && answer.status < 500 ? said : null);
};

/** Makes the business's workspace if it has none (safe to repeat) and answers its connected channels. */
export async function ensureWorkspace(settings: SocialAutoSettings, business: { readonly id: string; readonly name: string }, send: typeof fetch = fetch): Promise<AutoChannel[]> {
  const answer = await call(settings, "/api/v1/workspaces", { method: "POST", body: { externalId: business.id, name: business.name } }, send);
  if (answer.status !== 200 && answer.status !== 201) throw refusal(answer, "the workspace");
  return readChannels(answer.body);
}

/** The business's connected channels. A business that has no workspace yet has none. */
export async function loadChannels(settings: SocialAutoSettings, businessId: string, send: typeof fetch = fetch): Promise<AutoChannel[]> {
  const answer = await call(settings, `/api/v1/workspaces?externalId=${encodeURIComponent(businessId)}`, { method: "GET" }, send);
  if (answer.status === 404) return [];
  if (answer.status !== 200) throw refusal(answer, "the channels");
  return readChannels(answer.body);
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
  readonly caption: string;
  readonly pictureId: string;
  readonly channels: readonly string[];
}

/** Sets a post for a day, to the chosen channels. It goes out in that day's run, at 10:00 in India. */
export async function createPost(settings: SocialAutoSettings, businessId: string, post: NewPostRequest, send: typeof fetch = fetch): Promise<AutoPost> {
  const answer = await call(settings, "/api/v1/posts", { method: "POST", body: { externalId: businessId, day: post.day, caption: post.caption, pictureId: post.pictureId, channels: post.channels } }, send);
  if (answer.status !== 201) throw refusal(answer, "the post");
  const created = readPosts({ posts: [(answer.body as { post?: unknown } | null)?.post] })[0];
  if (created === undefined) throw new SocialAutoError("social-auto answered with a post that could not be read");
  return created;
}

export interface PostChanges {
  readonly day: string;
  readonly caption: string;
  /** A new picture; left out keeps the one the post has. */
  readonly pictureId?: string;
  readonly channels: readonly string[];
}

/** Changes a post the business made, while it has not gone out. */
export async function updatePost(settings: SocialAutoSettings, businessId: string, postId: string, changes: PostChanges, send: typeof fetch = fetch): Promise<AutoPost> {
  const query = new URLSearchParams({ externalId: businessId, postId });
  const body = { day: changes.day, caption: changes.caption, channels: changes.channels, ...(changes.pictureId === undefined ? {} : { pictureId: changes.pictureId }) };
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
