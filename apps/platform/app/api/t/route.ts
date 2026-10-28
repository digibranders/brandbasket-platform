import "server-only";
import { consumeRateLimit, findBusinessBySiteKey, getDailySalt, insertSiteHit, listLiveHostnames } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { handleHit, handleHitPreflight, type HitDeps } from "@/lib/server/site-hit-handler";
import { siteHasAccess } from "@/lib/server/site-api";

/**
 * `POST /api/t`: the first-party tracking script on a customer's website reports a page view, a tap or a form send.
 * The public site key in the body names the business; nothing in the body is a secret and none of it is believed beyond
 * that. The decisions live in lib/server/site-hit-handler.ts; this file only connects them to the database.
 */

// The staff connection is allowed here because the public key has already proved the business (see lib/server/db.ts).
const deps: HitDeps = {
  now: () => new Date(),
  findBusiness: (key) => findBusinessBySiteKey(getStaffDb(), key),
  hostnames: (businessId) => listLiveHostnames(getStaffDb(), businessId),
  hasAccess: (businessId, now) => siteHasAccess(businessId, now),
  withinLimit: async (key, rule) => (await consumeRateLimit(getStaffDb(), key, rule)).allowed,
  salt: (day) => getDailySalt(getStaffDb(), day),
  record: (hit) => insertSiteHit(getStaffDb(), hit),
};

export function OPTIONS(): Response {
  return handleHitPreflight();
}

export function POST(request: Request): Promise<Response> {
  return handleHit(request, deps);
}
