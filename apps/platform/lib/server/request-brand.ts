import "server-only";
import { headers } from "next/headers";
import { BRAND, type Brand } from "@/lib/brand";
import { allowsAnyLocalHost, appOriginForHost, readOriginsFromEnv } from "@/lib/surfaces";
import { serverEnv } from "./env";

const origins = readOriginsFromEnv(process.env);

/**
 * The Host of the current request. Under `next dev` the page a server action redirects to is rendered by a fetch to
 * localhost, so the host the person used survives only in X-Forwarded-Host; it is read there and only there, never in a
 * production build (where a client could set it).
 */
async function currentHost(): Promise<string | null> {
  const requestHeaders = await headers();
  return (allowsAnyLocalHost(process.env) ? requestHeaders.get("x-forwarded-host") : null) ?? requestHeaders.get("host");
}

/** The brand of the current request: this product's only one. Async to keep callers' shape; it reads nothing. */
export async function requestBrand(): Promise<Brand> {
  return BRAND;
}

/**
 * The dashboard origin to build a link on for a request with this Host header: the host the user is on, so a return
 * address or an emailed link lands where their session is.
 */
export function appOriginForHostHeader(rawHost: string | null): string {
  return origins === null ? serverEnv().APP_ORIGIN : appOriginForHost(rawHost, origins);
}

/** appOriginForHostHeader for a server component or action, which has no Request: it reads the current one's Host. */
export async function requestAppOrigin(): Promise<string> {
  return appOriginForHostHeader(await currentHost());
}

/**
 * requestAppOrigin for code that may also run with no request in scope (a script, a job): the app origin then. Only
 * "there is no request" falls back; anything else is the caller's to see.
 */
export async function currentAppOrigin(): Promise<string> {
  try {
    return await requestAppOrigin();
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) return serverEnv().APP_ORIGIN;
    throw error;
  }
}

/** requestBrand for code that may also run with no request in scope (a job, a script). */
export async function currentBrand(): Promise<Brand> {
  return BRAND;
}
