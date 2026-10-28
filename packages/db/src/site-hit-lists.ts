/**
 * The words a stored site hit may hold, in the database's own words (migration 0202). No imports, so the schema, the
 * queries and the tests read one list. packages/shared keeps its own copies for the tracking script (which must not
 * import this package); packages/shared/src/lib/analytics/lists.test.ts fails if the two drift.
 */

export const HIT_KINDS = ["pageview", "engagement", "call", "whatsapp", "email", "directions", "social", "outbound", "download", "form", "custom"] as const;
export type HitKind = (typeof HIT_KINDS)[number];

export const HIT_CHANNELS = ["direct", "search", "social", "email", "ai", "paid", "referral"] as const;
export type HitChannel = (typeof HIT_CHANNELS)[number];

export const HIT_DEVICES = ["mobile", "tablet", "desktop"] as const;
export type HitDevice = (typeof HIT_DEVICES)[number];
