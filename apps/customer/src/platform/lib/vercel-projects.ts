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

/** One authenticated Vercel call that expects JSON back. Errors carry the status and Vercel's own message, never the token. */
async function vercelJson(site: Pick<HostedSite, "vercelTeamId">, options: VercelCallOptions, call: { readonly method: "GET" | "POST"; readonly path: string; readonly query?: string; readonly body?: unknown; readonly what: string }): Promise<unknown> {
  if (options.token === null) throw new Error("VERCEL_API_TOKEN is not set.");
  const params = new URLSearchParams(call.query ?? "");
  if (site.vercelTeamId !== null) params.set("teamId", site.vercelTeamId);
  const query = params.toString();
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${VERCEL_API}${call.path}${query === "" ? "" : `?${query}`}`, {
      method: call.method,
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Could not reach Vercel to ${call.what}.`);
  }
  if (!response.ok) {
    const message = await vercelMessage(response);
    throw new Error(`Vercel answered ${response.status} to ${call.what}${message === null ? "." : `: ${message}`}`);
  }
  return response.json().catch(() => null);
}

/** Sets (or replaces) one production environment variable on a client's project. The site reads it at its next build. */
export async function setVercelProjectEnv(site: Pick<HostedSite, "vercelProjectId" | "vercelTeamId">, key: string, value: string, options: VercelCallOptions): Promise<void> {
  await vercelJson(site, options, {
    method: "POST",
    path: `/v10/projects/${encodeURIComponent(site.vercelProjectId)}/env`,
    query: "upsert=true",
    body: { key, value, type: "plain", target: ["production"] },
    what: `set ${key}`,
  });
}

/** Builds the project's newest ready production deployment again, so a changed environment variable takes effect. */
export async function redeployProduction(site: Pick<HostedSite, "vercelProjectId" | "vercelTeamId">, options: VercelCallOptions): Promise<void> {
  const list = await vercelJson(site, options, { method: "GET", path: "/v6/deployments", query: `projectId=${encodeURIComponent(site.vercelProjectId)}&target=production&state=READY&limit=1`, what: "list deployments" });
  const latest = typeof list === "object" && list !== null ? (list as { deployments?: { uid?: unknown; name?: unknown }[] }).deployments?.[0] : undefined;
  if (typeof latest?.uid !== "string" || typeof latest.name !== "string") throw new Error("The project has no ready production deployment to build again.");
  await vercelJson(site, options, { method: "POST", path: "/v13/deployments", query: "forceNew=1", body: { name: latest.name, deploymentId: latest.uid, target: "production" }, what: "redeploy" });
}
