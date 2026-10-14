import "server-only";
import { headers } from "next/headers";
import { clientIpFrom } from "../lib/client-ip";
import {
  resolveTurnstile,
  TURNSTILE_RESPONSE_FIELD,
  turnstileMessage,
  verifyTurnstile,
  type TurnstileFailure,
} from "./turnstile";

export type HumanCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Checks a submitted form's Turnstile token (see turnstile.ts). Returns `{ ok: true }` at once when Turnstile is not set
 * up on this deployment, so a server that has the release before it has the keys keeps working. `action` names the form
 * and must be the one its widget was rendered with. A refusal carries the message to show; the reason is logged without
 * the token.
 */
export async function checkHuman(formData: FormData, action: string, fetchFn: typeof fetch = fetch): Promise<HumanCheck> {
  const config = resolveTurnstile(process.env);
  if (config === null) return { ok: true };

  const raw = formData.get(TURNSTILE_RESPONSE_FIELD);
  const verdict = await verifyTurnstile({
    config,
    token: typeof raw === "string" ? raw : undefined,
    action,
    remoteIp: clientIpFrom(await headers()),
    fetchFn,
  });
  if (verdict.ok) return verdict;
  // A person who has not waited for the widget is routine; the rest say something is wrong, or someone is probing.
  if (verdict.reason !== "missing") console.warn("A form's robot check was refused.", { action, reason: verdict.reason satisfies TurnstileFailure });
  return { ok: false, message: turnstileMessage(verdict.reason) };
}

/** The widget's public key for the page to render with, or null when the check is off. */
export function turnstileSiteKey(): string | null {
  return resolveTurnstile(process.env)?.siteKey ?? null;
}

/**
 * Logged once at start on a real deployment that has no Turnstile keys, so the gap is visible in the logs rather than
 * silent. It does not stop the server: see the note in turnstile.ts.
 */
export function warnIfTurnstileUnconfigured(): void {
  if (process.env.NODE_ENV === "production" && resolveTurnstile(process.env) === null) {
    console.error("Turnstile is not set up (TURNSTILE_SITE_KEY and TURNSTILE_SECRET), so forms are not protected against bots.");
  }
}
