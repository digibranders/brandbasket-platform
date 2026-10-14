/*
 * Cloudflare Turnstile, the check that a form is being filled in by a person (https://developers.cloudflare.com/turnstile/).
 * The widget in the browser (ui/turnstile.tsx) puts a one-use token in the form's `cf-turnstile-response` field; the
 * server sends it to Cloudflare's siteverify and acts only when Cloudflare confirms it for this form (`action`) and one
 * of our own hostnames. This file is the part with no framework in it: the settings, and the verification.
 *
 * Settings (all read from the environment, so a key is never in the code):
 *   TURNSTILE_SITE_KEY    the widget's public key
 *   TURNSTILE_SECRET      the widget's secret
 *   TURNSTILE_HOSTNAMES   optional, comma separated: the hostnames a token may have been solved on
 * With either key missing the check is off and forms work as they did before: a release that reaches a server before its
 * keys do must not lock every customer out of signing in. Development has it off too, because the real widget refuses
 * localhost; TURNSTILE_ENABLE_IN_DEVELOPMENT=true turns it on there, with Cloudflare's test keys, to try the widget.
 */

/** The field the widget adds to the form, and the server reads. Cloudflare fixes this name. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's own limit on a token. A longer one is not a token. */
const MAX_TOKEN_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 10_000;

export interface TurnstileConfig {
  readonly siteKey: string;
  readonly secret: string;
  readonly hostnames: readonly string[];
  /**
   * True only while trying the widget in development with Cloudflare's test keys, whose answers carry no action and the
   * hostname example.com. Never true in production.
   */
  readonly testing: boolean;
}

/**
 * Where a token may have been solved when TURNSTILE_HOSTNAMES names none: the hosts of the dashboard and the console,
 * from APP_ORIGIN and ADMIN_ORIGIN.
 */
function defaultHostnames(env: Readonly<Record<string, string | undefined>>): string[] {
  const hosts = new Set<string>();
  for (const origin of [env.APP_ORIGIN, env.ADMIN_ORIGIN]) {
    try {
      if (origin !== undefined && origin.trim() !== "") hosts.add(new URL(origin).hostname.toLowerCase());
    } catch {
      // An origin that is not a URL is reported by the settings that read it; it just names no host here.
    }
  }
  return [...hosts];
}

/** The settings, or null when the check is off (see the note at the top of the file). */
export function resolveTurnstile(env: Readonly<Record<string, string | undefined>>): TurnstileConfig | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = env.TURNSTILE_SECRET?.trim() ?? "";
  if (siteKey === "" || secret === "") return null;
  if (env.NODE_ENV !== "production" && env.TURNSTILE_ENABLE_IN_DEVELOPMENT !== "true") return null;

  const listed = (env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter((hostname) => hostname !== "");
  return { siteKey, secret, hostnames: listed.length > 0 ? listed : defaultHostnames(env), testing: env.NODE_ENV !== "production" };
}

/** Why a token was not accepted. `unavailable` means Cloudflare could not be asked, which is never read as a pass. */
export type TurnstileFailure = "missing" | "invalid" | "wrong-action" | "wrong-hostname" | "unavailable";
export type TurnstileVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: TurnstileFailure };

interface Siteverify {
  readonly success?: boolean;
  readonly action?: string;
  readonly hostname?: string;
  readonly metadata?: { readonly result_with_testing_key?: boolean };
}

export interface VerifyTurnstileInput {
  readonly config: TurnstileConfig;
  /** What the form sent in `cf-turnstile-response`, or undefined when it sent nothing. */
  readonly token: string | undefined;
  /** The form this token must have been solved for, the same name the widget was rendered with. */
  readonly action: string;
  readonly remoteIp: string;
  readonly fetchFn?: typeof fetch;
}

export async function verifyTurnstile({ config, token, action, remoteIp, fetchFn = fetch }: VerifyTurnstileInput): Promise<TurnstileVerdict> {
  if (token === undefined || token === "" || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret: config.secret, response: token });
  if (remoteIp !== "" && remoteIp !== "unknown") body.set("remoteip", remoteIp);

  let result: Siteverify;
  try {
    const response = await fetchFn(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    result = (await response.json()) as Siteverify;
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (result.success !== true) return { ok: false, reason: "invalid" };
  if (config.testing && result.metadata?.result_with_testing_key === true) return { ok: true };
  if (result.action !== action) return { ok: false, reason: "wrong-action" };
  if (result.hostname === undefined || !config.hostnames.includes(result.hostname.toLowerCase())) return { ok: false, reason: "wrong-hostname" };
  return { ok: true };
}

/** What a form says when the check did not pass. Written for the person, never naming Cloudflare's codes. */
export function turnstileMessage(reason: TurnstileFailure): string {
  switch (reason) {
    case "missing":
      return "Please wait a moment while we check you are not a robot, then try again.";
    case "unavailable":
      return "We could not run the robot check just now. Please try again in a moment.";
    case "invalid":
    case "wrong-action":
    case "wrong-hostname":
      return "The robot check did not pass. Reload the page and try again.";
  }
}
