import type { TokenSource } from "./service-account";
import { parseReport, type Ga4Report, type Ga4ReportRequest } from "./report";

/** The reason a report could not be pulled, in words that are safe to store. */
export type Ga4Failure = "access_lost" | "bad_property" | "quota" | "unavailable";

export class Ga4Error extends Error {
  constructor(
    readonly failure: Ga4Failure,
    message: string,
  ) {
    super(message);
    this.name = "Ga4Error";
  }
}

/** Only the status decides the class; Google's message can name the property, so it is never kept. */
function failureOf(status: number): Ga4Failure {
  if (status === 403) return "access_lost";
  if (status === 400 || status === 404) return "bad_property";
  if (status === 429) return "quota";
  return "unavailable";
}

export interface Ga4Reader {
  readonly runReport: (propertyId: string, request: Ga4ReportRequest) => Promise<Ga4Report>;
}

export function createGa4Reader(token: TokenSource, fetchFn: typeof fetch = fetch): Ga4Reader {
  return {
    async runReport(propertyId, request) {
      if (!/^\d{1,20}$/.test(propertyId)) throw new Ga4Error("bad_property", "A Google Analytics property id is digits only.");
      let response: Response;
      try {
        response = await fetchFn(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
          method: "POST",
          headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new Ga4Error("unavailable", "Google Analytics could not be reached.");
      }
      if (!response.ok) throw new Ga4Error(failureOf(response.status), `Google Analytics answered HTTP ${response.status}.`);
      return parseReport(await response.json());
    },
  };
}
