import "server-only";
import { z } from "zod";

/**
 * Reads one conversation from OyeChats for a customer who opens a chat enquiry. Brandbasket keeps none of it: the
 * conversations stay in OyeChats and are fetched when asked for. Ported from apps/platform lib/server/oyechats-api.ts
 * (the per-lead message counts of the old table are not ported: the new list has no such column).
 *
 * The call carries the key of an OyeChats operator bound to that one bot (X-Operator-Key). OyeChats refuses such a key
 * anything outside its bot. The key is read from the staff-only table by the caller and passed in; it is never logged.
 *
 * Nothing here throws for a failed request: OyeChats being slow, down, unconfigured or refusing is an ordinary state the
 * view shows as "not available right now", so the function answers with a value that says so.
 */

const REQUEST_TIMEOUT_MS = 5_000;
/** OyeChats keeps at most this many characters per message in what we show. */
const MAX_MESSAGE_CHARS = 4_000;

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

const messageSchema = z.object({ role: z.string(), content: z.string(), timestamp: z.string().nullable().optional() });
const conversationSchema = z.object({ messages: z.array(z.unknown()) });
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** A moment from OyeChats. One that arrives without a zone is read as UTC, never the server's own zone. */
function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(HAS_ZONE.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const AUTHORS: Readonly<Record<string, MessageAuthor | undefined>> = { user: "visitor", bot: "assistant", operator: "team" };

/**
 * A conversation's messages as the view shows them, oldest first. Internal "system" lines and any role the view does not know
 * are left out; text is cut to a sensible length and never treated as markup.
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
