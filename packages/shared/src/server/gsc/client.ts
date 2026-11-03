import { z } from "zod";
import type { Ga4Failure } from "../ga4/client";
import type { TokenSource } from "../ga4/service-account";

/** The reason a Search Console question could not be answered, in words that are safe to store (the same classes as Analytics). */
export type GscFailure = Ga4Failure;

export class GscError extends Error {
  constructor(
    readonly failure: GscFailure,
    message: string,
  ) {
    super(message);
    this.name = "GscError";
  }
}

/** Only the status decides the class; Google's message can name the site, so it is never kept. */
function failureOf(status: number): GscFailure {
  if (status === 401 || status === 403) return "access_lost";
  if (status === 400 || status === 404) return "bad_property";
  if (status === 429) return "quota";
  return "unavailable";
}

export interface SearchAnalyticsRequest {
  readonly startDate: string;
  readonly endDate: string;
  readonly dimensions: readonly ("date" | "query" | "page")[];
  /** Only days Google has finished counting: today's and the last two days' numbers still move. */
  readonly dataState: "final";
  readonly rowLimit: number;
  readonly type: "web";
}

const rowsSchema = z.object({
  rows: z.array(z.object({ keys: z.array(z.string()), clicks: z.number(), impressions: z.number(), position: z.number() })).default([]),
});
export type SearchAnalyticsRows = z.output<typeof rowsSchema>;

export interface GscReader {
  readonly searchAnalytics: (siteUrl: string, request: SearchAnalyticsRequest) => Promise<SearchAnalyticsRows>;
}

export function createGscReader(token: TokenSource, fetchFn: typeof fetch = fetch): GscReader {
  return {
    async searchAnalytics(siteUrl, request) {
      let response: Response;
      try {
        response = await fetchFn(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
          method: "POST",
          headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        // A sign-in that cannot be had (lost, or Google down) keeps its own class, so the caller can tell it from this site.
        if (error instanceof Error && error.name.startsWith("Google")) throw error;
        throw new GscError("unavailable", "Search Console could not be reached.");
      }
      if (!response.ok) throw new GscError(failureOf(response.status), `Search Console answered HTTP ${response.status}.`);
      return rowsSchema.parse(await response.json());
    },
  };
}
