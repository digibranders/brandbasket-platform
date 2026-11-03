import { z } from "zod";
import type { TokenSource } from "../ga4/service-account";
import { callGoogle } from "./http";

/*
 * Site Verification and Search Console site registration (plan 62): ask for the meta tag token for a site, check that the site
 * shows it, add the site to Search Console and list the owners. Needs the write sign-in.
 */

const VERIFY = "https://www.googleapis.com/siteVerification/v1";
const SEARCH_CONSOLE = "https://www.googleapis.com/webmasters/v3/sites";
const WHAT = "Site Verification";

export interface SiteVerification {
  /** The value for the `google-site-verification` meta tag. */
  readonly metaToken: (siteUrl: string) => Promise<string>;
  /** True when Google saw the tag and now accepts us as an owner; false when the site does not show the tag yet. */
  readonly verify: (siteUrl: string) => Promise<boolean>;
  readonly addToSearchConsole: (siteUrl: string) => Promise<void>;
  readonly owners: (siteUrl: string) => Promise<readonly string[]>;
  readonly setOwners: (siteUrl: string, owners: readonly string[]) => Promise<void>;
}

const site = (siteUrl: string) => ({ type: "SITE", identifier: siteUrl });
const resource = (siteUrl: string): string => `${VERIFY}/webResource/${encodeURIComponent(siteUrl)}`;

/** The token inside the `<meta name="google-site-verification" content="..." />` tag Google hands back. */
export function tokenFromMeta(meta: string): string | null {
  return /content="([A-Za-z0-9_-]{20,100})"/.exec(meta)?.[1] ?? null;
}

export function createSiteVerification(token: TokenSource, fetchFn: typeof fetch = fetch): SiteVerification {
  const ownersOf = async (siteUrl: string): Promise<string[]> => {
    const { json } = await callGoogle(token, { method: "GET", url: resource(siteUrl), what: WHAT }, fetchFn);
    return z.object({ owners: z.array(z.string()).default([]) }).parse(json).owners;
  };
  return {
    async metaToken(siteUrl) {
      const { json } = await callGoogle(token, { method: "POST", url: `${VERIFY}/token`, what: WHAT, body: { site: site(siteUrl), verificationMethod: "META" } }, fetchFn);
      const meta = z.object({ token: z.string() }).parse(json).token;
      const found = tokenFromMeta(meta);
      if (found === null) throw new Error("Site Verification answered a token we could not read.");
      return found;
    },
    async verify(siteUrl) {
      // 400: Google did not find the tag yet. The next run tries again.
      const { status } = await callGoogle(token, { method: "POST", url: `${VERIFY}/webResource?verificationMethod=META`, what: WHAT, body: { site: site(siteUrl) }, accept: [400] }, fetchFn);
      return status !== 400;
    },
    async addToSearchConsole(siteUrl) {
      await callGoogle(token, { method: "PUT", url: `${SEARCH_CONSOLE}/${encodeURIComponent(siteUrl)}`, what: "Search Console" }, fetchFn);
    },
    owners: ownersOf,
    async setOwners(siteUrl, owners) {
      await callGoogle(token, { method: "PUT", url: resource(siteUrl), what: WHAT, body: { site: site(siteUrl), owners } }, fetchFn);
    },
  };
}
