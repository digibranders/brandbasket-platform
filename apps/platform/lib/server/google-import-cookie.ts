import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { allowsAnyLocalHost } from "@/lib/surfaces";
import { serverEnv } from "./env";
import { appOriginForHostHeader } from "./request-brand";
import { IMPORT_LIFETIME_MS, openGoogleImport, sealGoogleImport, type ImportedLocation } from "./google-import-seal";

/*
 * The two short-lived cookies of "Import from Google Business Profile" (docs/superpowers/specs/2026-10-01-business-
 * profile-design.md): the OAuth `state` that ties Google's answer to the browser that asked, and the sealed locations
 * the Details tab offers until the owner saves or discards them (google-import-seal.ts). Both are httpOnly and
 * SameSite=Lax: Google sends the owner back with a top-level GET, which Lax cookies go with.
 */

const STATE_COOKIE = "ff_google_state";
const IMPORT_COOKIE = "ff_google_import";
const STATE_BYTES = 32;

function cookieOptions(): { readonly httpOnly: true; readonly sameSite: "lax"; readonly secure: boolean; readonly path: "/"; readonly maxAge: number } {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().APP_ORIGIN.startsWith("https:"),
    path: "/",
    maxAge: IMPORT_LIFETIME_MS / 1000,
  };
}

/** A fresh `state` for one sign-in, kept in its cookie for the callback to check. */
export async function startGoogleState(): Promise<string> {
  const state = randomBytes(STATE_BYTES).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, cookieOptions());
  return state;
}

/** Whether Google's `state` is the one this browser was given. The cookie is spent either way. */
export async function takeGoogleState(returned: string | null): Promise<boolean> {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete(STATE_COOKIE);
  if (returned === null || expected === "" || returned.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(returned), Buffer.from(expected));
}

/** Keeps what the import found for this business. False when not even one location fits in a cookie. */
export async function rememberGoogleImport(businessId: string, locations: readonly ImportedLocation[]): Promise<boolean> {
  const sealed = sealGoogleImport(serverEnv().BETTER_AUTH_SECRET, { businessId, locations, now: new Date() });
  if (sealed === null) return false;
  (await cookies()).set(IMPORT_COOKIE, sealed, cookieOptions());
  return true;
}

/** What an import found for this business, still to be looked at; empty when there is none, or it has run out. */
export async function readGoogleImport(businessId: string): Promise<readonly ImportedLocation[]> {
  const sealed = (await cookies()).get(IMPORT_COOKIE)?.value;
  if (sealed === undefined) return [];
  return openGoogleImport(serverEnv().BETTER_AUTH_SECRET, { sealed, businessId, now: new Date() }) ?? [];
}

/** Drops the import: the owner saved their Details, or discarded what was found. */
export async function forgetGoogleImport(): Promise<void> {
  (await cookies()).delete(IMPORT_COOKIE);
}

/**
 * Where the import's pages are, as Google must be told and the owner sent back: the dashboard's own origin (the Fynix
 * host's, for an owner on it, whose Google redirect address must be authorised too), or under `next dev` the local
 * address the owner is using, so their session cookie comes along.
 */
export function googleImportOrigin(request: Request): string {
  return allowsAnyLocalHost(process.env) ? new URL(request.url).origin : appOriginForHostHeader(request.headers.get("host"));
}
