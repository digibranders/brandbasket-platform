import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { userPrivacySettings } from "../schema";
import { withUserScope } from "../scope";

/**
 * The nominee an owner has named (DPDP Act s.14). Every function takes the customer connection and runs under the user's
 * own scope, so row-level security, not just the query, keeps one owner out of another's row.
 */

export interface Nominee {
  readonly name: string;
  /** E.164. */
  readonly phone: string;
}

/** The nominee the user has named, or null when there is none. */
export async function findNominee(db: Database, userId: string): Promise<Nominee | null> {
  return withUserScope(db, userId, async (tx) => {
    const rows = await tx.select().from(userPrivacySettings).where(eq(userPrivacySettings.userId, userId)).limit(1);
    const row = rows[0];
    return row === undefined ? null : { name: row.nomineeName, phone: row.nomineePhone };
  });
}

/** Names the nominee, replacing any earlier one. */
export async function saveNominee(db: Database, userId: string, nominee: Nominee): Promise<void> {
  await withUserScope(db, userId, async (tx) => {
    await tx
      .insert(userPrivacySettings)
      .values({ userId, nomineeName: nominee.name, nomineePhone: nominee.phone })
      .onConflictDoUpdate({ target: userPrivacySettings.userId, set: { nomineeName: nominee.name, nomineePhone: nominee.phone, updatedAt: new Date() } });
  });
}

/** Removes the nominee. True when there was one. */
export async function clearNominee(db: Database, userId: string): Promise<boolean> {
  return withUserScope(db, userId, async (tx) => {
    const rows = await tx.delete(userPrivacySettings).where(eq(userPrivacySettings.userId, userId)).returning({ userId: userPrivacySettings.userId });
    return rows.length > 0;
  });
}
