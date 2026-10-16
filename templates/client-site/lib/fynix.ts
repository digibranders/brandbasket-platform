/**
 * Reads a business's content from the Fynix platform for a client website.
 *
 * The platform answers every request with the site token's business in mind. Once that business's plan has ended it
 * answers 403 with `{ code: "site_offline" }`: the token is good, but the website is not being served. This file turns
 * that into its own result, `offline`, so a site can show a maintenance page instead of an error.
 *
 * Environment (set in the site's hosting, never in the code):
 *   FYNIX_API_ORIGIN  the platform's address, e.g. https://app.fynix.digital
 *   FYNIX_SITE_TOKEN  the business's Site API token, from the client's page in the console
 */

export type FynixResult<T> =
  | { readonly kind: "ok"; readonly data: T }
  /** The plan has ended: show the maintenance page. */
  | { readonly kind: "offline" }
  /** Anything else that went wrong (bad token, platform down). `status` is 0 when the platform could not be reached. */
  | { readonly kind: "error"; readonly status: number };

const OFFLINE_CODE = "site_offline";

/** How long a page may be reused before asking again: short enough that a lapsed plan shows within a minute. */
const REVALIDATE_SECONDS = 60;

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") throw new Error(`${name} is not set.`);
  return value;
}

async function isOfflineAnswer(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && (body as { code?: unknown }).code === OFFLINE_CODE;
  } catch {
    return false;
  }
}

/** GET one of the platform's /api/site/* routes, e.g. `fynixGet<SiteInfo>("/api/site/info")`. */
export async function fynixGet<T>(path: string): Promise<FynixResult<T>> {
  // Read first, outside the try: a missing setting is a mistake to fix, not a platform that cannot be reached.
  const url = new URL(path, setting("FYNIX_API_ORIGIN"));
  const token = setting("FYNIX_SITE_TOKEN");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: REVALIDATE_SECONDS },
    } as RequestInit);
  } catch {
    return { kind: "error", status: 0 };
  }
  if (response.ok) return { kind: "ok", data: (await response.json()) as T };
  if (await isOfflineAnswer(response)) return { kind: "offline" };
  return { kind: "error", status: response.status };
}
