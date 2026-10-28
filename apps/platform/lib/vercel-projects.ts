import type { HostedSite } from "@brandbasket/db";

/*
 * Pauses and unpauses a client's hosting project on Vercel (POST /v1/projects/{id}/pause and /unpause). A paused project
 * blocks its production deployment and stops custom production domains being assigned; unpausing restores it. Errors carry
 * the status and Vercel's own message, never the token, because they are stored on the site's row and shown to staff.
 */

const VERCEL_API = "https://api.vercel.com";
const TIMEOUT_MS = 15_000;

export interface VercelCallOptions {
  /** The API token; null when it is not configured. */
  readonly token: string | null;
  readonly fetch?: typeof fetch;
}

export async function setVercelProjectPaused(
  site: Pick<HostedSite, "vercelProjectId" | "vercelTeamId">,
  paused: boolean,
  options: VercelCallOptions,
): Promise<void> {
  if (options.token === null) throw new Error("VERCEL_API_TOKEN is not set.");
  const verb = paused ? "pause" : "unpause";
  const query = site.vercelTeamId === null ? "" : `?teamId=${encodeURIComponent(site.vercelTeamId)}`;
  const url = `${VERCEL_API}/v1/projects/${encodeURIComponent(site.vercelProjectId)}/${verb}${query}`;

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Could not reach Vercel to ${verb} the project.`);
  }
  if (response.ok) return;

  const message = await vercelMessage(response);
  throw new Error(`Vercel answered ${response.status} to ${verb}${message === null ? "." : `: ${message}`}`);
}

/** Vercel's `{ error: { message } }`, or null when the body is not that. */
async function vercelMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
    const message = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined;
    return typeof message === "string" && message !== "" ? message.slice(0, 200) : null;
  } catch {
    return null;
  }
}
