import "server-only";
import { countSiteEvents, deleteSaltsBefore, deleteSiteHitsBefore, listRollupCandidates, listSiteHits, recordSourceRun, upsertBreakdown, upsertDailyMetrics, type Database } from "@brandbasket/db";
import type { RollupDeps } from "@/lib/site-analytics-rollup-run";
import { getStaffDb } from "./db";

/**
 * The real thing the nightly roll-up runs against: the staff database. Each day's numbers and the note that the day was
 * measured are written together, so a day is never marked measured without its numbers.
 */
export function realRollupDeps(db: Database = getStaffDb()): RollupDeps {
  return {
    candidates: (from, to) => listRollupCandidates(db, from, to),
    hits: (businessId, from, to) => listSiteHits(db, businessId, from, to),
    legacy: (businessId, from, to) => countSiteEvents(db, businessId, { from, to }),
    writeDaily: (businessId, day, rows, now) =>
      db.transaction(async (tx) => {
        await upsertDailyMetrics(tx, businessId, rows.map((row) => ({ metric: row.metric, day, value: row.value })), now);
        await recordSourceRun(tx, { businessId, source: "own", windowStart: day, windowEnd: day, error: null, now });
      }),
    writeBreakdown: (businessId, month, dimension, rows, now) => upsertBreakdown(db, { businessId, source: "own", month, dimension, rows, now }),
    recordFailure: (businessId, windowStart, windowEnd, errorName, now) =>
      recordSourceRun(db, { businessId, source: "own", windowStart, windowEnd, error: errorName, now }),
    deleteOldHits: (cutoff) => deleteSiteHitsBefore(db, cutoff),
    deleteOldSalts: (beforeDay) => deleteSaltsBefore(db, beforeDay),
  };
}
