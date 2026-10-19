import "server-only";
import { z } from "zod";

/**
 * Reads from OyeChats on behalf of a customer who opens their OyeChats page: how many messages each lead exchanged and when it
 * was last active, and the messages of one conversation. Brandbasket keeps none of this: the conversations stay in OyeChats and are
 * fetched when asked for.
 *
 * Every call is made with the key of an OyeChats operator bound to that one bot (X-Operator-Key). OyeChats refuses such a key
 * anything outside its bot, so a wrong bot number or session id comes back as a refusal, not another bot's data. The key is
 * read from the staff-only table by the caller and passed in; it is never logged and never leaves the server.
 *
 * Nothing here throws for a failed request: OyeChats being slow, down, unconfigured or refusing is an ordinary state the page
 * shows as "not available right now", so each function answers with a value that says so.
 */

const REQUEST_TIMEOUT_MS = 5_000;
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 5;
const SUMMARY_TTL_MS = 60_000;
const FAILURE_TTL_MS = 15_000;
const CACHE_MAX_BOTS = 200;
/** OyeChats keeps at most this many messages per conversation in its detail answer; a longer one is cut by OyeChats itself. */
const MAX_MESSAGE_CHARS = 4_000;

/** How a lead's conversation has gone: the number of messages and the last time the visitor or bot spoke. */
export interface LeadActivity {
  readonly messages: number;
  readonly lastActiveAt: Date | null;
}

/** Who said a message: the visitor, the assistant (the bot), or a person on the team who stepped in. */
export type MessageAuthor = "visitor" | "assistant" | "team";

export interface ConversationMessage {
  readonly author: MessageAuthor;
  readonly text: string;
  readonly at: Date | null;
}

export type ConversationResult =
  | { readonly status: "ok"; readonly messages: readonly ConversationMessage[] }
  | { readonly status: "not-found" }
  | { readonly status: "unavailable" };

/** What OyeChats needs to answer for one bot. */
export interface OyeChatsAccess {
  readonly oyechatsBotId: number;
  readonly operatorKey: string;
}

/** The OyeChats address from OYECHATS_API_URL, reduced to its origin; null when it is unset or not an http(s) address. */
export function oyechatsApiOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const raw = env.OYECHATS_API_URL?.trim();
  if (raw === undefined || raw === "") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const leadSummarySchema = z.object({
  session_id: z.string().min(1),
  chats: z.number().int().min(0),
  last_active_at: z.string().nullable().optional(),
});

const leadListSchema = z.object({ leads: z.array(z.unknown()), total: z.number().int().min(0).optional() });

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
  timestamp: z.string().nullable().optional(),
});

const conversationSchema = z.object({ messages: z.array(z.unknown()) });

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** A moment from OyeChats. Its columns carry a zone; one that arrives without is read as UTC, never the server's own zone. */
function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(HAS_ZONE.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** One page of OyeChats' lead list as sessions with their activity; rows that do not have the expected shape are skipped. */
export function parseLeadListPage(body: unknown): { readonly rows: ReadonlyMap<string, LeadActivity>; readonly count: number } | null {
  const page = leadListSchema.safeParse(body);
  if (!page.success) return null;
  const rows = new Map<string, LeadActivity>();
  for (const item of page.data.leads) {
    const lead = leadSummarySchema.safeParse(item);
    if (lead.success) rows.set(lead.data.session_id, { messages: lead.data.chats, lastActiveAt: parseDate(lead.data.last_active_at) });
  }
  return { rows, count: page.data.leads.length };
}

const AUTHORS: Readonly<Record<string, MessageAuthor | undefined>> = { user: "visitor", bot: "assistant", operator: "team" };

/**
 * A conversation's messages as the page shows them, oldest first. Internal "system" lines and any role this page does not
 * know are left out; text is cut to a sensible length and never treated as markup.
 */
export function parseConversation(body: unknown): readonly ConversationMessage[] | null {
  const conversation = conversationSchema.safeParse(body);
  if (!conversation.success) return null;
  const messages: ConversationMessage[] = [];
  for (const item of conversation.data.messages) {
    const message = messageSchema.safeParse(item);
    if (!message.success) continue;
    const author = Object.hasOwn(AUTHORS, message.data.role) ? AUTHORS[message.data.role] : undefined;
    if (author === undefined) continue;
    messages.push({ author, text: message.data.content.slice(0, MAX_MESSAGE_CHARS), at: parseDate(message.data.timestamp) });
  }
  return messages;
}

type Fetched = { readonly kind: "ok"; readonly body: unknown } | { readonly kind: "not-found" } | { readonly kind: "failed" };

async function getJson(origin: string, path: string, operatorKey: string): Promise<Fetched> {
  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { "X-Operator-Key": operatorKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) {
      console.warn("OyeChats refused a read", { path: path.split("?")[0], status: response.status });
      return { kind: "failed" };
    }
    return { kind: "ok", body: await response.json() };
  } catch (error) {
    console.warn("OyeChats could not be reached", { path: path.split("?")[0], error: error instanceof Error ? error.name : "unknown" });
    return { kind: "failed" };
  }
}

interface CachedSummaries {
  readonly at: number;
  readonly expiresAfter: number;
  readonly rows: ReadonlyMap<string, LeadActivity> | null;
}

const summaryCache = new Map<string, CachedSummaries>();

/** Forgets what was read, so the next read asks OyeChats again. For tests. */
export function resetOyeChatsCache(): void {
  summaryCache.clear();
}

function remember(key: string, rows: ReadonlyMap<string, LeadActivity> | null, now: number): void {
  if (summaryCache.size >= CACHE_MAX_BOTS) {
    const oldest = summaryCache.keys().next();
    if (!oldest.done) summaryCache.delete(oldest.value);
  }
  summaryCache.set(key, { at: now, expiresAfter: rows === null ? FAILURE_TTL_MS : SUMMARY_TTL_MS, rows });
}

/**
 * Every session OyeChats holds for the bot, newest activity first, with its message count and last activity: the lead list's
 * Messages and Last active columns. Kept for a minute (a failure for fifteen seconds, so a slow OyeChats does not slow every
 * page load). Null when OyeChats is not configured, unreachable or refuses.
 */
export async function fetchLeadActivity(access: OyeChatsAccess, now: number = Date.now()): Promise<ReadonlyMap<string, LeadActivity> | null> {
  const origin = oyechatsApiOrigin();
  if (origin === null) return null;

  const cacheKey = `${origin}|${access.oyechatsBotId}`;
  const cached = summaryCache.get(cacheKey);
  if (cached !== undefined && now - cached.at < cached.expiresAfter) return cached.rows;

  const rows = new Map<string, LeadActivity>();
  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const result = await getJson(origin, `/leads?bot_id=${access.oyechatsBotId}&page=${page}&limit=${LIST_PAGE_SIZE}`, access.operatorKey);
    const parsed = result.kind === "ok" ? parseLeadListPage(result.body) : null;
    if (parsed === null) {
      remember(cacheKey, null, now);
      return null;
    }
    for (const [sessionId, activity] of parsed.rows) rows.set(sessionId, activity);
    if (parsed.count < LIST_PAGE_SIZE) break;
  }
  remember(cacheKey, rows, now);
  return rows;
}

/** The messages of one conversation. `not-found` when OyeChats has no such session for this bot; `unavailable` for any failure. */
export async function fetchConversation(access: OyeChatsAccess, sessionId: string): Promise<ConversationResult> {
  const origin = oyechatsApiOrigin();
  if (origin === null) return { status: "unavailable" };
  const result = await getJson(origin, `/leads/${encodeURIComponent(sessionId)}`, access.operatorKey);
  if (result.kind === "not-found") return { status: "not-found" };
  if (result.kind === "failed") return { status: "unavailable" };
  const messages = parseConversation(result.body);
  return messages === null ? { status: "unavailable" } : { status: "ok", messages };
}
