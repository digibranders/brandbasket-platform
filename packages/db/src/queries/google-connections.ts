import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { googleConnections, type GoogleConnectionPurpose, type GoogleConnectionRow } from "../schema";

/** The read and write sign-ins of the Brandbasket Google account, as the console and the jobs use them. Staff connection only. */

export async function findGoogleConnection(db: Database, slot: number, purpose: GoogleConnectionPurpose): Promise<GoogleConnectionRow | null> {
  const rows = await db
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.slot, slot), eq(googleConnections.purpose, purpose)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listGoogleConnections(db: Database): Promise<GoogleConnectionRow[]> {
  return db.select().from(googleConnections).orderBy(asc(googleConnections.slot), asc(googleConnections.purpose));
}

/** Stores a fresh sign-in, replacing the earlier one for that slot and purpose, and marks it connected. */
export async function saveGoogleConnection(
  db: Database,
  input: {
    readonly slot: number;
    readonly purpose: GoogleConnectionPurpose;
    readonly accountEmail: string;
    readonly scopes: readonly string[];
    readonly sealedRefreshToken: string;
    readonly staffUserId: string;
    readonly now: Date;
  },
): Promise<void> {
  const fields = {
    accountEmail: input.accountEmail,
    scopes: [...input.scopes],
    sealedRefreshToken: input.sealedRefreshToken,
    status: "connected" as const,
    lastOkAt: input.now,
    lastError: null,
    connectedByStaffId: input.staffUserId,
    updatedAt: input.now,
  };
  await db
    .insert(googleConnections)
    .values({ slot: input.slot, purpose: input.purpose, ...fields })
    .onConflictDoUpdate({ target: [googleConnections.slot, googleConnections.purpose], set: fields });
}

/**
 * Records that Google refused the sign-in (the password changed or access was removed). Returns true only when the row was
 * connected until now, so whoever raises an alert does it once per change of state, not on every failed night.
 */
export async function markGoogleConnectionLost(db: Database, slot: number, purpose: GoogleConnectionPurpose, error: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(googleConnections)
    .set({ status: "access_lost", lastError: error.slice(0, 300), updatedAt: now })
    .where(and(eq(googleConnections.slot, slot), eq(googleConnections.purpose, purpose), eq(googleConnections.status, "connected")))
    .returning({ id: googleConnections.id });
  return rows.length > 0;
}

export async function markGoogleConnectionOk(db: Database, slot: number, purpose: GoogleConnectionPurpose, now: Date): Promise<void> {
  await db
    .update(googleConnections)
    .set({ lastOkAt: now, lastError: null, updatedAt: now })
    .where(and(eq(googleConnections.slot, slot), eq(googleConnections.purpose, purpose)));
}
