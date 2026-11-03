import { latestGa4Day, listGa4Properties, recordSourceRun, setReportSourceStatus, upsertBreakdown, upsertDailyMetrics, type Database } from "@brandbasket/db";
import type { Ga4Store } from "./sync";

/** The nightly Google Analytics pull's real store: the staff database. */
export function realGa4Store(db: Database): Ga4Store {
  return {
    properties: () => listGa4Properties(db),
    latestDay: (businessId) => latestGa4Day(db, businessId),
    writeDaily: (businessId, rows, now) => upsertDailyMetrics(db, businessId, rows, now),
    writeList: (businessId, month, dimension, rows, now) => upsertBreakdown(db, { businessId, source: "ga4", month, dimension, rows, now }),
    recordRun: (businessId, windowStart, windowEnd, error, now) => recordSourceRun(db, { businessId, source: "ga4", windowStart, windowEnd, error, now }),
    setStatus: (businessId, status, error, now) => setReportSourceStatus(db, { businessId, source: "ga4", status, error, now }),
  };
}
