import "server-only";
import { postingServiceSettings } from "./analytics/rules";

/** The posting service refused or failed. Thrown, so the panel or action shows its error state and Sentry hears of it. */
export class PostingServiceError extends Error {
  constructor(
    readonly status: number,
    what: string,
    /** What the service said was wrong, for a refusal the customer can fix (a 4xx); null otherwise. */
    readonly detail: string | null = null,
  ) {
    super(`The posting service answered ${status} for ${what}.`);
    this.name = "PostingServiceError";
  }
}

export interface ServiceAnswer {
  readonly status: number;
  readonly body: unknown;
}

const TIMEOUT_MS = 10_000;

/**
 * One call to the posting service's product API with this server's key. Never follows a redirect (the key must not travel
 * anywhere else), gives up after ten seconds, and throws when the service cannot be reached. The business is always an id the
 * caller took from the session, never from the browser.
 */
export async function callPostingService(path: string, init: { readonly method: "GET" | "POST"; readonly body?: unknown }, send: typeof fetch = fetch): Promise<ServiceAnswer> {
  const settings = postingServiceSettings(process.env);
  if (settings === null) throw new PostingServiceError(0, path, "this server has no posting service address");
  let response: Response;
  try {
    response = await send(`${settings.url}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${settings.key}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PostingServiceError(0, path, "it could not be reached");
  }
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** A refusal as an error: a 4xx carries what the service said, anything else says only the status. */
export function refusal(answer: ServiceAnswer, what: string): PostingServiceError {
  const said = (answer.body as { error?: unknown } | null)?.error;
  return new PostingServiceError(answer.status, what, answer.status >= 400 && answer.status < 500 && typeof said === "string" ? said : null);
}
