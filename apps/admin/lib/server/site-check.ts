import "server-only";
import { BlockList, isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

export type SiteCheckFailure = "invalid-host" | "dns" | "private-address" | "tls" | "timeout" | "http-status" | "unreachable";

export type SiteCheckResult =
  | { readonly ok: true; readonly status: number }
  | { readonly ok: false; readonly reason: SiteCheckFailure; readonly status?: number };

export interface SiteCheckDeps {
  readonly resolve4: (hostname: string) => Promise<string[]>;
  readonly resolve6: (hostname: string) => Promise<string[]>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
}

const CHECK_TIMEOUT_MS = 8000;

/** Conservative: letter-led top label (so no IP literal gets through), labels that start and end with a letter or digit. */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

/** Node error codes for a TLS or certificate failure, on the error itself or its cause (fetch wraps the TLS error). */
const TLS_CODE = /CERT|TLS|SSL|VERIFY|EPROTO/;

/**
 * Addresses that reach this machine or its private networks. This is a server-side request forgery guard: the hostname
 * comes from our database, but its DNS is set by the customer. Also covers "this network" (0.0.0.0/8, ::), which
 * Linux routes to the local host.
 */
const NON_PUBLIC = new BlockList();
NON_PUBLIC.addSubnet("0.0.0.0", 8, "ipv4");
NON_PUBLIC.addSubnet("10.0.0.0", 8, "ipv4");
NON_PUBLIC.addSubnet("127.0.0.0", 8, "ipv4");
NON_PUBLIC.addSubnet("169.254.0.0", 16, "ipv4");
NON_PUBLIC.addSubnet("172.16.0.0", 12, "ipv4");
NON_PUBLIC.addSubnet("192.168.0.0", 16, "ipv4");
NON_PUBLIC.addSubnet("::", 128, "ipv6");
NON_PUBLIC.addSubnet("::1", 128, "ipv6");
NON_PUBLIC.addSubnet("fc00::", 7, "ipv6");
NON_PUBLIC.addSubnet("fe80::", 10, "ipv6");

/** True for an address that is private, loopback, link-local or unique-local, and for anything that is not an IP at all. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return NON_PUBLIC.check(address, "ipv4");
  if (family === 6) return NON_PUBLIC.check(address, "ipv6");
  return true;
}

const DEFAULT_DEPS: SiteCheckDeps = {
  resolve4: (hostname) => resolve4(hostname),
  resolve6: (hostname) => resolve6(hostname),
  fetch: (url, init) => fetch(url, init),
};

/**
 * Asks whether a hostname answers over HTTPS. A second check beside the launch checklist, never the authority on whether
 * a site is live: a pass says the address loads, nothing more. Resolves to a reason on every failure; never throws.
 */
export async function checkSiteAddress(hostname: string, deps: Partial<SiteCheckDeps> = {}): Promise<SiteCheckResult> {
  if (!HOSTNAME.test(hostname) || isIP(hostname) !== 0 || hostname.toLowerCase() === "localhost") {
    return { ok: false, reason: "invalid-host" };
  }

  const resolver = { ...DEFAULT_DEPS, ...deps };
  const lookups = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  const addresses = lookups.flatMap((lookup) => (lookup.status === "fulfilled" ? lookup.value : []));
  if (addresses.length === 0) return { ok: false, reason: "dns" };
  if (addresses.every(isPrivateAddress)) return { ok: false, reason: "private-address" };

  let response: Response;
  try {
    response = await resolver.fetch(`https://${hostname}/`, { redirect: "manual", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch (error) {
    return { ok: false, reason: fetchFailure(error) };
  }
  await response.body?.cancel();

  if (response.status >= 200 && response.status <= 399) return { ok: true, status: response.status };
  return { ok: false, reason: "http-status", status: response.status };
}

function fetchFailure(error: unknown): "tls" | "timeout" | "unreachable" {
  const name = nameOf(error);
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  const codes = [codeOf(error), codeOf(causeOf(error))];
  return codes.some((code) => TLS_CODE.test(code)) ? "tls" : "unreachable";
}

function nameOf(value: unknown): string {
  return typeof value === "object" && value !== null && "name" in value && typeof value.name === "string" ? value.name : "";
}

function codeOf(value: unknown): string {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : "";
}

function causeOf(value: unknown): unknown {
  return typeof value === "object" && value !== null && "cause" in value ? value.cause : undefined;
}
