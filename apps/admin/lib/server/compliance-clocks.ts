import "server-only";
import { listBreaches, listOpenPrivacyRequests, type StoredBreach, type StoredPrivacyRequest } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { ClockStripProps } from "@/components/compliance/clock-strip";
import { complianceClocks } from "@/lib/compliance-model";
import { getStaffDb } from "./db";

async function guarded<T>(name: string, read: () => Promise<readonly T[]>): Promise<readonly T[] | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`[compliance] could not read the ${name}`, errorLogInfo(error));
    return null;
  }
}

/**
 * The clock strip's data. Each register is read on its own, so one failure leaves the other's clocks on screen. Pass the
 * rows a page has already read so they are not read twice.
 */
export async function readClockStrip(now: Date, known: { readonly requests?: readonly StoredPrivacyRequest[] | null; readonly breaches?: readonly StoredBreach[] | null } = {}): Promise<ClockStripProps> {
  const db = getStaffDb();
  const [requests, breaches] = await Promise.all([
    known.requests !== undefined ? known.requests : guarded("privacy requests", () => listOpenPrivacyRequests(db)),
    known.breaches !== undefined ? known.breaches : guarded("breach register", () => listBreaches(db)),
  ]);
  const { items, running } = complianceClocks(requests ?? [], breaches ?? [], now);
  return { items, running, unread: [...(requests === null ? ["privacy requests"] : []), ...(breaches === null ? ["breach register"] : [])] };
}

export { guarded as readGuarded };
