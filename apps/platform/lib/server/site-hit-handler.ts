import "server-only";
import type { NewSiteHit, RateLimitRule } from "@brandbasket/db";
import { classifyChannel } from "@brandbasket/shared/lib/analytics/classify-channel";
import { isBot } from "@brandbasket/shared/lib/analytics/bots";
import { deviceClass } from "@brandbasket/shared/lib/analytics/device";
import { HIT_BODY_LIMIT, parseHit } from "@brandbasket/shared/lib/analytics/payload";
import { countryFrom, hostAllowed, istDay, optedOut, originHost } from "@brandbasket/shared/lib/analytics/request";
import { visitorHash } from "@brandbasket/shared/lib/analytics/visitor-hash";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { readBodyWithin } from "@/lib/server/site-events";

/** One business's websites may send this many hits a minute: well above a small business's traffic, low enough to stop a flood. */
export const SITE_HIT_BUSINESS_RULE: RateLimitRule = { limit: 300, windowSeconds: 60 };
/** One visitor (today's hash) may send this many a minute: a person clicks and scrolls, a loop does more. */
export const SITE_HIT_VISITOR_RULE: RateLimitRule = { limit: 60, windowSeconds: 60 };

/** Everything the handler needs from outside, so the whole decision runs without a database or a clock. */
export interface HitDeps {
  readonly now: () => Date;
  /** The business that owns a public site key, or null. */
  readonly findBusiness: (key: string) => Promise<string | null>;
  /** The business's live hostnames. */
  readonly hostnames: (businessId: string) => Promise<readonly string[]>;
  /** Whether the business's website is still being served (its plan has not ended). */
  readonly hasAccess: (businessId: string, now: Date) => Promise<boolean>;
  /** Counts one more against a rate limit and says whether it is still within it. */
  readonly withinLimit: (key: string, rule: RateLimitRule) => Promise<boolean>;
  /** The salt for an Indian day (`YYYY-MM-DD`). */
  readonly salt: (day: string) => Promise<string>;
  readonly record: (hit: NewSiteHit) => Promise<void>;
}

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** The answer to every hit, good or bad: it tells a prober nothing about which keys exist or why a hit was dropped. */
function noContent(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

export function handleHitPreflight(): Response {
  return noContent();
}

/**
 * `POST /api/t`: a tracking script on a customer's website reports what a visitor did. The cheap checks come first and need
 * no database: the visitor's opt-out, bots, the size and shape of the body. Then the key proves the business, the page's
 * host must be the business's own, its plan must be live, and the limits must allow it. Only then is a hit stored, with
 * the device, channel, country and a daily visitor hash worked out here; the address and the user agent are never kept.
 * Every outcome is a 204.
 */
export async function handleHit(request: Request, deps: HitDeps): Promise<Response> {
  try {
    if (optedOut(request.headers)) return noContent();
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return noContent();

    const text = await readBodyWithin(request, HIT_BODY_LIMIT);
    if (text === null) return noContent();
    const hit = parseHit(text);
    if (hit === null) return noContent();

    const businessId = await deps.findBusiness(hit.key);
    if (businessId === null) return noContent();
    const hosts = await deps.hostnames(businessId);
    if (!hostAllowed(originHost(request.headers), hosts)) return noContent();
    const now = deps.now();
    if (!(await deps.hasAccess(businessId, now))) return noContent();
    if (!(await deps.withinLimit(`site-hit:${businessId}`, SITE_HIT_BUSINESS_RULE))) return noContent();

    const visitor = visitorHash({ salt: await deps.salt(istDay(now)), businessId, ip: clientIpFrom(request.headers), userAgent });
    if (!(await deps.withinLimit(`site-hit-visitor:${businessId}:${visitor}`, SITE_HIT_VISITOR_RULE))) return noContent();

    await deps.record({
      businessId,
      at: now,
      kind: hit.kind,
      path: hit.path,
      referrerHost: hit.referrerHost,
      channel: classifyChannel({ referrerHost: hit.referrerHost, medium: hit.utmMedium, source: hit.utmSource, ownHosts: hosts }),
      utmSource: hit.utmSource,
      utmMedium: hit.utmMedium,
      utmCampaign: hit.utmCampaign,
      device: deviceClass(userAgent),
      country: countryFrom(request.headers),
      label: hit.label,
      visitorHash: visitor,
      engagedMs: hit.engagedMs,
      scrollPct: hit.scrollPct,
    });
    return noContent();
  } catch (error) {
    // Never the raw error: Drizzle puts the failed query's params, here the site key, into its message.
    console.error("Could not record a site hit.", errorLogInfo(error));
    return noContent();
  }
}
