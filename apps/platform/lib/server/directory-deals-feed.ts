import "server-only";
import { readDealsOnShow, type Database } from "@firstfold/db";
import { localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import {
  DIRECTORY_DEALS_TIME_ZONE,
  DIRECTORY_DEALS_VERSION,
  type DirectoryDealsFeed,
} from "@firstfold/shared/lib/directory/deals-contract";

/** The deals on show today, in the shape the website reads. */
export async function readDirectoryDealsFeed(db: Database, now: Date): Promise<DirectoryDealsFeed> {
  const today = localDateIn(DIRECTORY_DEALS_TIME_ZONE, now);
  const deals = await readDealsOnShow(db, today);
  return { version: DIRECTORY_DEALS_VERSION, generatedAt: now.toISOString(), today, deals };
}
