import { z } from "zod";

/*
 * The pure parts of the site health job (site-health.ts): what counts as up, when the daily phone speed check is due, when
 * an outage starts, and how a PageSpeed Insights answer is read. No I/O here.
 */

export const HTTP_TIMEOUT_MS = 10_000;
export const CERTIFICATE_TIMEOUT_MS = 10_000;
export const PAGESPEED_TIMEOUT_MS = 90_000;
export const SITE_CHECK_CONCURRENCY = 4;
export const SPEED_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PART_LIMIT = 300;
const ERROR_LIMIT = 1000;

export type SiteResult = "up" | "down";

/** The address the job checks: the site's home page over https. */
export function siteUrl(hostname: string): string {
  return new URL(`https://${hostname}/`).toString();
}

/** A site that answers below 400, after redirects, is up. */
export function resultFromHttpStatus(httpStatus: number): SiteResult {
  return httpStatus < 400 ? "up" : "down";
}

/** Why a fetch of the site threw, for staff: a timeout, the network code ("ENOTFOUND"), or the message. */
export function fetchFailureText(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return `Timed out after ${String(HTTP_TIMEOUT_MS / 1000)} seconds`;
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error && "code" in cause && typeof cause.code === "string") return `Could not connect (${cause.code})`;
  return error instanceof Error ? error.message : String(error);
}

/** The `error` column: the parts that went wrong, each kept short so none pushes another out. */
export function errorText(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => part !== null && part !== "").map((part) => part.slice(0, PART_LIMIT));
  return kept.length === 0 ? null : kept.join("; ").slice(0, ERROR_LIMIT);
}

/** The phone speed check runs at most once a day per site, counting failed tries, so a broken site does not use the quota. */
export function speedDue(lastAttemptAt: Date | null, now: Date): boolean {
  return lastAttemptAt === null || now.getTime() - lastAttemptAt.getTime() >= SPEED_INTERVAL_MS;
}

/**
 * True on the check that makes an outage: this one and the one before are down, and the one before those was up. A site that
 * stays down matches only once, so staff hear once per outage. Results newest first, this check included.
 */
export function startsOutage(results: readonly SiteResult[]): boolean {
  return results[0] === "down" && results[1] === "down" && results[2] === "up";
}

/** The PageSpeed Insights v5 request for a site's phone (mobile strategy) performance. */
export function pageSpeedRequestUrl(url: string, apiKey: string | null): string {
  const request = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  request.searchParams.set("url", url);
  request.searchParams.set("strategy", "mobile");
  request.searchParams.set("category", "performance");
  if (apiKey !== null && apiKey !== "") request.searchParams.set("key", apiKey);
  return request.toString();
}

const pageSpeedAnswer = z.object({
  lighthouseResult: z.object({
    categories: z.object({ performance: z.object({ score: z.number().min(0).max(1) }) }),
    audits: z.object({ "largest-contentful-paint": z.object({ numericValue: z.number().nonnegative() }) }),
  }),
});

export interface PhoneSpeed {
  /** 0 to 100. */
  readonly score: number;
  readonly lcpMs: number;
}

/** Reads the score (0 to 1 in the answer, 0 to 100 stored) and the largest contentful paint. Throws on any other shape. */
export function parsePageSpeed(body: unknown): PhoneSpeed {
  const parsed = pageSpeedAnswer.safeParse(body);
  if (!parsed.success) throw new Error("PageSpeed answered without a performance score");
  const { lighthouseResult } = parsed.data;
  return { score: Math.round(lighthouseResult.categories.performance.score * 100), lcpMs: Math.round(lighthouseResult.audits["largest-contentful-paint"].numericValue) };
}

/** A time as staff read it in the alert: "3 November 2026, 14:20 IST". */
export function alertTimeWords(date: Date): string {
  const day = date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return `${day}, ${time} IST`;
}

/** Runs `work` over `items` with at most `limit` running at once. `work` must not throw; results keep the items' order. */
export async function inPool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
