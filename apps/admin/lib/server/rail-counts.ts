import "server-only";
import { countCallsBetween, countLateProjects, countLeadsToContact, countSupportTicketsAwaitingStaff } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { RailCountKey, RailCounts } from "@/lib/console-rail";
import { todayRange } from "@/lib/team-time";
import { getStaffDb } from "./db";
import { readPaymentsCount } from "./payments-count";
import { countTodayItems } from "./today";

/** One count, or nothing when it cannot be read: the failure is logged and only that count is left off the rail. */
export async function countOrNothing(key: RailCountKey, read: () => Promise<number>): Promise<number | undefined> {
  try {
    return await read();
  } catch (error) {
    console.error("[rail-counts] could not read a count; leaving it off", { key, ...errorLogInfo(error) });
    return undefined;
  }
}

/** The numbers beside the rail's entries (plan 41, contract C2). A phase that adds a count adds one entry here. */
export async function readRailCounts(): Promise<RailCounts> {
  const db = getStaffDb();
  const now = new Date();
  const today = todayRange(now);
  const [todayItems, leads, requests, projects, calls, payments] = await Promise.all([
    countOrNothing("today", () => countTodayItems()),
    countOrNothing("leads", () => countLeadsToContact(db)),
    countOrNothing("requests", () => countSupportTicketsAwaitingStaff(db)),
    countOrNothing("projects", () => countLateProjects(db, now)),
    countOrNothing("calls", () => countCallsBetween(db, today.start, today.end)),
    countOrNothing("payments", () => readPaymentsCount(now)),
  ]);
  const read: readonly (readonly [RailCountKey, number | undefined])[] = [
    ["today", todayItems],
    ["leads", leads],
    ["requests", requests],
    ["projects", projects],
    ["calls", calls],
    ["payments", payments],
  ];
  const counts: Partial<Record<RailCountKey, number>> = {};
  for (const [key, value] of read) if (value !== undefined) counts[key] = value;
  return counts;
}
