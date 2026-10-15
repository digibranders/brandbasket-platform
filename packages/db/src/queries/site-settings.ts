import { eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { siteSettings, users, type SiteSetting } from "../schema";

type Runner = Database | ScopedTransaction;

/** One setting, or null when it is not set. Staff connection. */
export async function findSiteSetting(db: Runner, key: string): Promise<SiteSetting | null> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return rows[0] ?? null;
}

/** Sets a setting, replacing what was there, and records who did it. Staff connection. */
export async function saveSiteSetting(db: Runner, input: { readonly key: string; readonly value: string; readonly staffUserId: string; readonly now: Date }): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: input.key, value: input.value, updatedByStaffId: input.staffUserId, updatedAt: input.now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: input.value, updatedByStaffId: input.staffUserId, updatedAt: input.now } });
}

/** Clears a setting, so it is not set any more. Staff connection. */
export async function clearSiteSetting(db: Runner, key: string): Promise<void> {
  await db.delete(siteSettings).where(eq(siteSettings.key, key));
}

/** A setting with the address of whoever last changed it, for the console to say who to ask. Null when it is not set. */
export async function findSiteSettingWithEditor(
  db: Runner,
  key: string,
): Promise<(SiteSetting & { readonly updatedByEmail: string | null }) | null> {
  const rows = await db
    .select({ setting: siteSettings, email: users.email })
    .from(siteSettings)
    .leftJoin(users, eq(users.id, siteSettings.updatedByStaffId))
    .where(eq(siteSettings.key, key))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row.setting, updatedByEmail: row.email };
}
