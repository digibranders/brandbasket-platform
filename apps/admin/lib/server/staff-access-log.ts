import "server-only";
import { recordStaffAccess, type StaffAccessEntry } from "@fynix/db";
import { clientIpFrom } from "@fynix/shared/lib/client-ip";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { headers } from "next/headers";
import { getStaffDb } from "./db";

export type StaffAccessLogInput = Omit<StaffAccessEntry, "ipAddress">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function write(entry: StaffAccessLogInput): Promise<void> {
  await recordStaffAccess(getStaffDb(), {
    ...entry,
    // The business column is a UUID; an id taken from a URL may not be one, and that must not fail the page.
    businessId: entry.businessId !== null && entry.businessId !== undefined && UUID.test(entry.businessId) ? entry.businessId : null,
    ipAddress: clientIpFrom(await headers()),
  });
}

/**
 * Records that a staff member opened something (DPDP Rules 2025 r.6(1)(c)). For a page view: if the record cannot be
 * written the failure is logged, without the entry's contents, and the page still loads, so a logging fault never takes
 * the console down. Use `logStaffAccessOrThrow` where nothing may be served without a record.
 */
export async function logStaffAccess(entry: StaffAccessLogInput): Promise<void> {
  try {
    await write(entry);
  } catch (error) {
    console.error("A staff access could not be logged.", { action: entry.action, ...errorLogInfo(error) });
  }
}

/** For exports and downloads: when the record cannot be written this throws, so the file is not served. */
export async function logStaffAccessOrThrow(entry: StaffAccessLogInput): Promise<void> {
  await write(entry);
}
