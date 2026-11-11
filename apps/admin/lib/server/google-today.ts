import "server-only";
import { listGoogleAttention, listGoogleConnections } from "@brandbasket/db";
import { googleAttentionCutoffs, googleAttentionItems, googleSignInItems } from "@/lib/google-today";
import type { TodayItem } from "@/lib/today-queue";
import { getStaffDb } from "./db";

/**
 * The Google rows of Today. The lost sign-in is the Brandbasket account's own, so only roles that may use the Google account
 * (admins) get it; everyone else sees the client rows. The sealed tokens are not read into anything that leaves this function:
 * only each sign-in's purpose, status and time are kept.
 */
export async function readGoogleToday(now: Date, canSeeGoogleAccount: boolean): Promise<readonly TodayItem[]> {
  const db = getStaffDb();
  const [attention, connections] = await Promise.all([
    listGoogleAttention(db, googleAttentionCutoffs(now)),
    canSeeGoogleAccount ? listGoogleConnections(db) : Promise.resolve([]),
  ]);
  return [
    ...googleAttentionItems(attention, now),
    ...googleSignInItems(connections.map((connection) => ({ purpose: connection.purpose, status: connection.status, updatedAt: connection.updatedAt }))),
  ];
}
