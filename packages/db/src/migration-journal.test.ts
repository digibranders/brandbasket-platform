import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the migration journal without a database. The migrator applies a migration only when its `when` is greater
 * than the newest one already recorded, so an entry whose `when` is not above the one before it is silently skipped in
 * production. drizzle-kit writes `when` from the machine's clock: if that clock is behind an entry already in the
 * journal, edit the new entry's `when` by hand to a larger value (see docs/deployment/fynix-droplet.md).
 */

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const META = join(MIGRATIONS, "meta");

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}
interface Snapshot {
  readonly id: string;
  readonly prevId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function readJournal(): JournalEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(join(META, "_journal.json"), "utf8"));
  const list = isRecord(parsed) ? parsed.entries : undefined;
  if (!Array.isArray(list)) throw new Error("The migration journal has no entries list.");
  return list.map((item: unknown): JournalEntry => {
    if (!isRecord(item) || typeof item.idx !== "number" || typeof item.when !== "number" || typeof item.tag !== "string") {
      throw new Error(`A migration journal entry is malformed: ${JSON.stringify(item)}`);
    }
    return { idx: item.idx, when: item.when, tag: item.tag };
  });
}

const entries = readJournal();

/** The first migration whose snapshots must form an unbroken chain. Older ones were generated on other branches. */
const CHAIN_FROM = 119;

/**
 * Migrations written without a drizzle snapshot (hand-written SQL, or generated on a branch that did not commit one).
 * This list only shrinks: a new migration needs its `meta/NNNN_snapshot.json`.
 */
const WITHOUT_SNAPSHOT: ReadonlySet<string> = new Set([
  "0027_razorpay_plan_ids",
  "0033_referral_code_delete_grant",
  "0039_plans_69_and_2999",
  "0091_affiliates_coupons",
  "0092_drop_referrer_columns",
  "0099_directory_ad_placements",
  "0100_directory_ad_spots",
  "0109_directory_review_comments_grants",
  "0113_geo_catalog_guards",
  "0114_geo_catalog_seed",
  "0117_listing_tagline",
]);

function number(tag: string): number {
  return Number(tag.slice(0, 4));
}
function snapshotFile(tag: string): string {
  return join(META, `${tag.slice(0, 4)}_snapshot.json`);
}
function readSnapshot(tag: string): Snapshot {
  const parsed: unknown = JSON.parse(readFileSync(snapshotFile(tag), "utf8"));
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.prevId !== "string") {
    throw new Error(`The snapshot for ${tag} has no id and prevId.`);
  }
  return { id: parsed.id, prevId: parsed.prevId };
}

describe("migration journal", () => {
  it("numbers its entries from 0 without gaps", () => {
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
  });

  it("has strictly increasing `when` values, so no new migration can be skipped as already applied", () => {
    const offenders = entries.flatMap((entry, index) => {
      const previous = entries[index - 1];
      return previous !== undefined && entry.when <= previous.when ? [`${entry.tag} (${entry.when}) is not above ${previous.tag} (${previous.when})`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("orders its tags by their migration number, each used once", () => {
    const numbers = entries.map((entry) => number(entry.tag));
    expect(numbers.every((value, index) => index === 0 || value > (numbers[index - 1] ?? 0))).toBe(true);
    expect(entries.every((entry) => /^\d{4}_[a-z0-9_]+$/.test(entry.tag))).toBe(true);
  });

  it("has a SQL file for every entry and no SQL file outside the journal", () => {
    const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -4)).sort();
    expect(files).toEqual(entries.map((entry) => entry.tag).sort());
  });

  it("has a snapshot for every entry except the known older ones", () => {
    const missing = entries.filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag)).flatMap((entry) => {
      try {
        readSnapshot(entry.tag);
        return [];
      } catch {
        return [entry.tag];
      }
    });
    expect(missing).toEqual([]);
    const stale = [...WITHOUT_SNAPSHOT].filter((tag) => !entries.some((entry) => entry.tag === tag));
    expect(stale).toEqual([]);
  });

  it("chains each snapshot from 0119 onward to the one before it", () => {
    const chain = entries.filter((entry) => !WITHOUT_SNAPSHOT.has(entry.tag));
    const broken = chain.flatMap((entry, index) => {
      const previous = chain[index - 1];
      if (previous === undefined || number(entry.tag) < CHAIN_FROM) return [];
      return readSnapshot(entry.tag).prevId === readSnapshot(previous.tag).id ? [] : [`${entry.tag} does not follow ${previous.tag}`];
    });
    expect(broken).toEqual([]);
    expect(chain.some((entry) => number(entry.tag) >= CHAIN_FROM)).toBe(true);
  });
});
