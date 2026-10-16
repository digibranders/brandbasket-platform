/**
 * How long ago the first payment was confirmed, in the short form the dashboard badge shows after "Paid": "just now",
 * "14 min ago", "2 h ago", "3 days ago". A clock that runs behind the server's never shows a negative time. Pure and
 * browser-safe.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatPaidAgo(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < MINUTE_MS) return "just now";
  if (elapsedMs < HOUR_MS) return `${String(Math.floor(elapsedMs / MINUTE_MS))} min ago`;
  if (elapsedMs < DAY_MS) return `${String(Math.floor(elapsedMs / HOUR_MS))} h ago`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? "1 day ago" : `${String(days)} days ago`;
}
