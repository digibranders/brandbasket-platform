import { latestGscDay, listGscSites, recordSourceRun, setReportSourceStatus, upsertBreakdown, upsertDailyMetrics, type Database } from "@brandbasket/db";
import type { GscStore } from "./sync";

/** The nightly Search Console pull's real store: the staff database. */
export function realGscStore(db: Database): GscStore {
  return {
    sites: () => listGscSites(db),
    latestDay: (businessId) => latestGscDay(db, businessId),
    writeDaily: (businessId, rows, now) => upsertDailyMetrics(db, businessId, rows, now),
    writeList: (businessId, month, dimension, rows, now) => upsertBreakdown(db, { businessId, source: "gsc", month, dimension, rows, now }),
    recordRun: (businessId, windowStart, windowEnd, error, now) => recordSourceRun(db, { businessId, source: "gsc", windowStart, windowEnd, error, now }),
    setStatus: (businessId, status, error, now) => setReportSourceStatus(db, { businessId, source: "gsc", status, error, now }),
  };
}
