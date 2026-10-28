import { brandbasketGet } from "@/lib/brandbasket";

/** How long an answer is reused. A lapsed plan shows, and a paid one returns, within this long. */
const ANSWER_TTL_MS = 60_000;
/** After an error (a bad token, the platform down) ask again sooner; an error never takes the site offline. */
const ERROR_TTL_MS = 10_000;

let cached: { readonly offline: boolean; readonly until: number } | null = null;

/**
 * Whether the platform says this site's plan has ended. The proxy runs on every request, so the answer is kept in this
 * server's memory for a minute rather than asked for on each page view and image.
 */
export async function isSiteOffline(now: number = Date.now()): Promise<boolean> {
  if (cached !== null && now < cached.until) return cached.offline;
  const info = await brandbasketGet<unknown>("/api/site/info");
  const offline = info.kind === "offline";
  cached = { offline, until: now + (info.kind === "error" ? ERROR_TTL_MS : ANSWER_TTL_MS) };
  return offline;
}

/** Forgets the kept answer. For tests. */
export function forgetOfflineAnswer(): void {
  cached = null;
}
