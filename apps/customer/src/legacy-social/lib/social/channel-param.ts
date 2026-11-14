import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/*
 * Which channel the customer is looking at stays the same as she moves between Calendar, Posts and Analytics: it travels in the address as
 * `?channel=instagram` (or `all`), so each page opens on the channel she chose on the last one.
 */

export const CHANNEL_PARAM = "channel";

/** The channel named in the address: a network, `all`, or null when there is none (or it is not one we know). */
export function channelParamOf(value: string | null | undefined): ChannelPlatform | "all" | null {
  if (value === "all") return "all";
  return CHANNEL_PLATFORMS.find((platform) => platform === value) ?? null;
}

/** The same address with the channel in it (`?channel=instagram`); an address with no channel chosen is left as it is. */
export function withChannel(href: string, channel: ChannelPlatform | "all" | null): string {
  if (channel === null) return href;
  const [path = href] = href.split("?");
  return `${path}?${CHANNEL_PARAM}=${channel}`;
}

/** Puts the channel in the address the browser shows, without loading the page again. */
export function rememberChannel(channel: ChannelPlatform | "all"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(CHANNEL_PARAM, channel);
  // `null`, not the page's own state: only a call made this way is seen by the router, so the tabs and the address stay together.
  window.history.replaceState(null, "", url);
}
