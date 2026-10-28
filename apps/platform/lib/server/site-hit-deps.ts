import "server-only";
import { consumeRateLimit, findBusinessBySiteKey, getDailySalt, insertSiteHit, listLiveHostnames, type Database } from "@brandbasket/db";
import type { HitDeps } from "./site-hit-handler";
import { getStaffDb } from "./db";
import { siteHasAccess } from "./site-api";

/** The real thing POST /api/t runs against: the staff database, and the plan check that takes a website offline with its plan. */
export function realHitDeps(db: Database = getStaffDb()): HitDeps {
  return {
    now: () => new Date(),
    findBusiness: (key) => findBusinessBySiteKey(db, key),
    hostnames: (businessId) => listLiveHostnames(db, businessId),
    hasAccess: (businessId, now) => siteHasAccess(businessId, now),
    withinLimit: async (key, rule) => (await consumeRateLimit(db, key, rule)).allowed,
    salt: (day) => getDailySalt(db, day),
    record: (hit) => insertSiteHit(db, hit),
  };
}
