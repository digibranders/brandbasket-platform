import { randomBytes, randomInt } from "node:crypto";
import { and, asc, eq, gte, isNull, lt, max, min, sql } from "drizzle-orm";
import type { Database } from "../client";
import { domains, siteEvents, siteHits, siteKeys, visitorSalts, type SiteHit, type SiteKey } from "../schema";
import type { ScopedTransaction } from "../scope";
import type { HitChannel, HitDevice, HitKind } from "../site-hit-lists";

type Runner = Database | ScopedTransaction;

/*
 * The first-party site analytics store (plan 56). The ingest route and the jobs write on the staff connection once a
 * public site key has proved the business; the customer reads only their own key, through withTenantScope.
 */

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_LENGTH = 24;

/** A new public key: `bbk_` and 24 random letters and digits. It only names a business, so it is safe in a page. */
export function generateSiteKey(): string {
  let key = "bbk_";
  for (let index = 0; index < KEY_LENGTH; index++) key += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return key;
}

/** A new random salt for one day's visitor hashes: 64 hex characters. */
function generateSalt(): string {
  return randomBytes(32).toString("hex");
}

/** The business's key, made on the first ask and the same on every later one, even when two asks arrive together. Staff connection. */
export async function ensureSiteKey(db: Runner, businessId: string, makeKey: () => string = generateSiteKey): Promise<SiteKey> {
  await db.insert(siteKeys).values({ businessId, key: makeKey() }).onConflictDoNothing({ target: siteKeys.businessId });
  const [row] = await db.select().from(siteKeys).where(eq(siteKeys.businessId, businessId));
  if (row === undefined) throw new Error(`No site key for business ${businessId} after creating it`);
  return row;
}

/** The business's key, or null when it has none. A customer scope sees their own. */
export async function getSiteKey(db: Runner, businessId: string): Promise<SiteKey | null> {
  const [row] = await db.select().from(siteKeys).where(eq(siteKeys.businessId, businessId));
  return row ?? null;
}

/** The business a public key belongs to, or null for an unknown key. Staff connection. */
export async function findBusinessBySiteKey(db: Runner, key: string): Promise<string | null> {
  const [row] = await db.select({ businessId: siteKeys.businessId }).from(siteKeys).where(eq(siteKeys.key, key));
  return row?.businessId ?? null;
}

/** The salt for a day (`YYYY-MM-DD`), made on the first ask and the same on every later one. Staff connection. */
export async function getDailySalt(db: Runner, day: string, makeSalt: () => string = generateSalt): Promise<string> {
  await db.insert(visitorSalts).values({ day, salt: makeSalt() }).onConflictDoNothing({ target: visitorSalts.day });
  const [row] = await db.select({ salt: visitorSalts.salt }).from(visitorSalts).where(eq(visitorSalts.day, day));
  if (row === undefined) throw new Error(`No salt for ${day} after creating it`);
  return row.salt;
}

/** Deletes the salts of days before `day`, so hashes made with them can never be matched again. Returns how many. Staff connection. */
export async function deleteSaltsBefore(db: Runner, day: string): Promise<number> {
  const removed = await db.delete(visitorSalts).where(lt(visitorSalts.day, day)).returning({ day: visitorSalts.day });
  return removed.length;
}

export interface NewSiteHit {
  readonly businessId: string;
  readonly at: Date;
  readonly kind: HitKind;
  readonly path: string;
  readonly referrerHost: string | null;
  readonly channel: HitChannel;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly device: HitDevice;
  readonly country: string | null;
  readonly label: string | null;
  readonly visitorHash: string;
  readonly engagedMs: number | null;
  readonly scrollPct: number | null;
}

/** Stores one hit. Staff connection. */
export async function insertSiteHit(db: Runner, hit: NewSiteHit): Promise<void> {
  await db.insert(siteHits).values(hit);
}

/** A business's hits from `from` (included) to `to` (excluded), oldest first. Staff connection. */
export async function listSiteHits(db: Runner, businessId: string, from: Date, to: Date): Promise<SiteHit[]> {
  return db
    .select()
    .from(siteHits)
    .where(and(eq(siteHits.businessId, businessId), gte(siteHits.at, from), lt(siteHits.at, to)))
    .orderBy(asc(siteHits.at));
}

/** Deletes every hit older than `cutoff` (the 90-day retention) and returns how many. Staff connection. */
export async function deleteSiteHitsBefore(db: Runner, cutoff: Date): Promise<number> {
  const removed = await db.delete(siteHits).where(lt(siteHits.at, cutoff)).returning({ id: siteHits.id });
  return removed.length;
}

/** When the business last sent a hit, or null if it never has: the install panel's "last event received". Staff connection. */
export async function lastSiteHitAt(db: Runner, businessId: string): Promise<Date | null> {
  const [row] = await db.select({ at: max(siteHits.at) }).from(siteHits).where(eq(siteHits.businessId, businessId));
  return row?.at ?? null;
}

/** The business's hostnames that have not been removed, lower case, oldest first: the hosts a hit may come from. Staff connection. */
export async function listLiveHostnames(db: Runner, businessId: string): Promise<string[]> {
  const rows = await db
    .select({ hostname: sql<string>`lower(${domains.hostname})` })
    .from(domains)
    .where(and(eq(domains.businessId, businessId), isNull(domains.removedAt)))
    .orderBy(asc(domains.createdAt), asc(domains.hostname));
  return rows.map((row) => row.hostname);
}

export interface RollupCandidate {
  readonly businessId: string;
  /** When the business's script first reported, or null when it never has (it only used the older server route). */
  readonly firstHitAt: Date | null;
}

/**
 * The businesses a night's roll-up looks at: every one that has ever sent a hit (a quiet day is a measured zero for them),
 * and every one that only used the older `site_events` route inside [from, to). Ordered by business. Staff connection.
 */
export async function listRollupCandidates(db: Runner, from: Date, to: Date): Promise<RollupCandidate[]> {
  const withHits = await db.select({ businessId: siteHits.businessId, firstHitAt: min(siteHits.at) }).from(siteHits).groupBy(siteHits.businessId);
  const legacy = await db
    .selectDistinct({ businessId: siteEvents.businessId })
    .from(siteEvents)
    .where(and(gte(siteEvents.occurredAt, from), lt(siteEvents.occurredAt, to)));
  const known = new Set(withHits.map((row) => row.businessId));
  const rows: RollupCandidate[] = [
    ...withHits.map((row) => ({ businessId: row.businessId, firstHitAt: row.firstHitAt })),
    ...legacy.filter((row) => !known.has(row.businessId)).map((row) => ({ businessId: row.businessId, firstHitAt: null })),
  ];
  return rows.sort((a, b) => (a.businessId < b.businessId ? -1 : a.businessId > b.businessId ? 1 : 0));
}
