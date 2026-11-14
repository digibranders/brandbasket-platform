import { z } from "zod";
import { CHANNEL_NAMES, PLATFORMS, type Platform } from "../analytics/rules";

/*
 * The accounts a business has connected for posting, as the posting service lists them, and what the Accounts page says about
 * them. Pure: no network and no server code. Ported from apps/platform lib/social/auto.ts and notices.ts.
 */

export const isPlatform = (value: unknown): value is Platform => PLATFORMS.some((platform) => platform === value);

/** The kind of account each network wants, shown under its Connect button. */
export const PLATFORM_HINTS: Readonly<Record<Platform, string>> = {
  instagram: "A Business or Creator account",
  facebook: "A Page you manage",
  linkedin: "Your own profile",
  google: "The Google account that manages your listing",
};

/** The order the networks are listed in. */
export const PLATFORM_ORDER: readonly Platform[] = ["instagram", "facebook", "linkedin", "google"];

const channelSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(PLATFORMS),
  account: z.string(),
  connectedAt: z.string(),
  /** Only LinkedIn and Instagram connections have an end date. */
  expiresAt: z.string().optional(),
  /** Posts are being held back from this account (the team paused it, its workspace, or everything). */
  paused: z.boolean().optional(),
});
export type Channel = z.output<typeof channelSchema>;

/** The channels of a workspace answer (`{"workspace": {"channels": [...]}}`). One that does not read, such as a network this page does not know yet, is dropped. */
export function readChannels(body: unknown): Channel[] {
  const channels = (body as { workspace?: { channels?: unknown } } | null)?.workspace?.channels;
  if (!Array.isArray(channels)) return [];
  return channels.flatMap((item): Channel[] => {
    const parsed = channelSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The link to the network's own Allow page, when it is a safe address: https, or http only on this computer. */
export function readConnectLink(body: unknown): string | null {
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.endsWith(".localhost");
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && local) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;
/** A connection is worth the customer's attention once it ends within this many days. */
export const ENDING_SOON_DAYS = 7;

/** Whole days until the connection ends (negative when it has), or null when it has no end date. */
export function daysUntilEnd(channel: Pick<Channel, "expiresAt">, now: Date): number | null {
  if (channel.expiresAt === undefined) return null;
  const end = Date.parse(channel.expiresAt);
  return Number.isNaN(end) ? null : Math.floor((end - now.getTime()) / DAY_MS);
}

export function endsInWords(days: number): string {
  if (days < 0) return "The connection has ended";
  if (days === 0) return "Ends today";
  return days === 1 ? "Ends in 1 day" : `Ends in ${days} days`;
}

export interface AccountRow {
  readonly id: string;
  readonly platform: Platform;
  readonly name: string;
  readonly account: string;
  /** "Ends in 5 days" when the connection ends soon or has, else null. */
  readonly ending: string | null;
  readonly paused: boolean;
}

export interface LiveAccounts {
  readonly rows: readonly AccountRow[];
  /** The networks with no account yet: each gets a Connect button. */
  readonly missing: readonly Platform[];
}

export function liveAccountsOf(channels: readonly Channel[], now: Date): LiveAccounts {
  const rows = channels.map((channel): AccountRow => {
    const days = daysUntilEnd(channel, now);
    return { id: channel.id, platform: channel.platform, name: CHANNEL_NAMES[channel.platform], account: channel.account, ending: days !== null && days <= ENDING_SOON_DAYS ? endsInWords(days) : null, paused: channel.paused === true };
  });
  rows.sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  return { rows, missing: PLATFORM_ORDER.filter((platform) => !channels.some((channel) => channel.platform === platform)) };
}

export interface NoticeLine {
  readonly ok: boolean;
  readonly text: string;
}

const CONNECT_NOTICES = {
  connected: (name: string): NoticeLine => ({ ok: true, text: `${name} is connected. Posts from now on will also go there.` }),
  denied: (name: string): NoticeLine => ({ ok: false, text: `${name} was not connected: the approval was cancelled. Press Connect to try again.` }),
  failed: (name: string): NoticeLine => ({ ok: false, text: `${name} could not be connected. Try again, and press Allow on its page.` }),
} as const;

/** What the page says when a network sends the customer back (`?social=connected|denied|failed&channel=instagram`). Null for anything else, so a made-up address says nothing. */
export function connectNoticeLine(social: string | readonly string[] | undefined, channel: string | readonly string[] | undefined, reason?: string | readonly string[] | undefined): NoticeLine | null {
  if (typeof social !== "string" || (social !== "connected" && social !== "denied" && social !== "failed")) return null;
  const name = typeof channel === "string" && isPlatform(channel) ? CHANNEL_NAMES[channel] : "That account";
  // The posting service refuses an account that is connected elsewhere: it never says whose it is, so the line does not either.
  // The posting service says why a failed connection failed when it knows: the link took too long, or the Google account manages no listing.
  if (social === "failed" && reason === "EXPIRED") return { ok: false, text: `${name === "That account" ? "That account" : name} was not connected: the connection took too long. Press Connect and try again.` };
  if (social === "failed" && reason === "NO_LOCATION") return { ok: false, text: "That Google account does not manage a business listing, so nothing was connected. Press Connect Google and sign in with the account that manages yours." };
  if (social === "failed" && reason === "ACCOUNT_IN_USE") return { ok: false, text: `${name === "That account" ? "That account" : `That ${name} account`} is already connected somewhere else, so it was not connected here. Use a different account, or tell us if you think this is a mistake.` };
  return CONNECT_NOTICES[social](name);
}

/** A refused connect that the customer may settle herself: an account connected to another of her own brands, which she can move here. */
export interface AccountInUse {
  readonly channel: Platform;
  /** The posting service's id of the brand that holds the account. */
  readonly heldBy: string;
}

/** Reads `?social=failed&channel=instagram&reason=ACCOUNT_IN_USE&heldBy=<id>`; null for anything else, and when the brand that holds it is not named (another customer's, never shown). */
export function accountInUse(params: { readonly social?: string | readonly string[]; readonly channel?: string | readonly string[]; readonly reason?: string | readonly string[]; readonly heldBy?: string | readonly string[] }): AccountInUse | null {
  const { social, channel, reason, heldBy } = params;
  if (social !== "failed" || reason !== "ACCOUNT_IN_USE" || typeof channel !== "string" || !isPlatform(channel)) return null;
  if (typeof heldBy !== "string" || heldBy.trim() === "" || heldBy.length > 200) return null;
  return { channel, heldBy };
}

export const CONNECT_UNAVAILABLE = "Connecting accounts is not available just now. Try again later, or ask us for help.";
export const CONNECT_FAILED = "We could not start the connection. Try again, and if it keeps happening, tell us.";
