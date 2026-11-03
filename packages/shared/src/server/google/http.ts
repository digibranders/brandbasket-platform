import type { TokenSource } from "../ga4/service-account";

/** The reason a Google call failed, in words that are safe to store (the same classes as the readers use). */
export type GoogleApiFailure = "access_lost" | "bad_property" | "quota" | "unavailable";

/** Only the status decides the class; Google's message can name a site or a property, so it is never kept. */
export function failureOfStatus(status: number): GoogleApiFailure {
  if (status === 401 || status === 403) return "access_lost";
  if (status === 400 || status === 404) return "bad_property";
  if (status === 429) return "quota";
  return "unavailable";
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly failure: GoogleApiFailure,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export interface GoogleCall {
  readonly method: "GET" | "POST" | "PUT";
  readonly url: string;
  readonly body?: unknown;
  /** What is being asked, for the error text: "Analytics Admin", "Site Verification". */
  readonly what: string;
  /** Statuses that are an answer, not a failure (a 409 "already exists"). Their body is returned with the status. */
  readonly accept?: readonly number[];
}

export interface GoogleAnswer {
  readonly status: number;
  readonly json: unknown;
}

/** One authenticated JSON call to a Google API. A sign-in that cannot be had keeps its own error; a network failure is "unavailable". */
export async function callGoogle(token: TokenSource, call: GoogleCall, fetchFn: typeof fetch = fetch): Promise<GoogleAnswer> {
  const bearer = await token();
  let response: Response;
  try {
    response = await fetchFn(call.url, {
      method: call.method,
      headers: { authorization: `Bearer ${bearer}`, ...(call.body === undefined ? {} : { "content-type": "application/json" }) },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new GoogleApiError(0, "unavailable", `${call.what} could not be reached.`);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok && !(call.accept ?? []).includes(response.status)) throw new GoogleApiError(response.status, failureOfStatus(response.status), `${call.what} answered HTTP ${response.status}.`);
  return { status: response.status, json };
}
