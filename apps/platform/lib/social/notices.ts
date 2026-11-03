import type { NoticeLine } from "@/lib/requests/notices";
import { isChannelPlatform, PLATFORM_NAMES } from "./auto";

const SOCIAL_NOTICES = {
  approved: { ok: true, text: "Approved. Thank you, we will publish on the dates shown." },
  changed: { ok: false, text: "Some posts changed while you were looking. Check them below and try again." },
  failed: { ok: false, text: "We could not save that. Try again." },
} as const satisfies Readonly<Record<string, NoticeLine>>;

/** What the Social media page says for `?notice=` after an approval; null for anything but the three words the action sends. */
export function socialNoticeLine(value: string | readonly string[] | undefined): NoticeLine | null {
  if (typeof value !== "string" || !Object.hasOwn(SOCIAL_NOTICES, value)) return null;
  return SOCIAL_NOTICES[value as keyof typeof SOCIAL_NOTICES];
}

const CONNECT_NOTICES = {
  connected: (name: string): NoticeLine => ({ ok: true, text: `${name} is connected. Posts from now on will also go there.` }),
  denied: (name: string): NoticeLine => ({ ok: false, text: `${name} was not connected: the approval was cancelled. Press Connect to try again.` }),
  failed: (name: string): NoticeLine => ({ ok: false, text: `${name} could not be connected. Try again, and press Allow on its page.` }),
  unavailable: (): NoticeLine => ({ ok: false, text: "Connecting accounts is not available just now. Try again later, or ask us for help." }),
} as const;

/**
 * What the page says when a network sends the customer back (`?social=connected|denied|failed&channel=instagram`) or when
 * the Connect button could not start. Null for anything else, so a made-up address says nothing.
 */
export function connectNoticeLine(social: string | readonly string[] | undefined, channel: string | readonly string[] | undefined): NoticeLine | null {
  if (typeof social !== "string") return null;
  if (social === "unavailable") return CONNECT_NOTICES.unavailable();
  if (social !== "connected" && social !== "denied" && social !== "failed") return null;
  const name = typeof channel === "string" && isChannelPlatform(channel) ? PLATFORM_NAMES[channel] : "That account";
  return CONNECT_NOTICES[social](name);
}
