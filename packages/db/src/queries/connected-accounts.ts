import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import {
  connectedAccounts,
  type ConnectedAccount,
  type ConnectedAccountStatus,
  type ConnectedPlatform,
} from "../schema/connected-accounts";
import type { ScopedTransaction } from "../scope";
import { currentBusinessId, isUuid } from "./tenant";

/** Customer side, inside withTenantScope. Read only: staff maintain these rows. */
export async function listConnectedAccounts(tx: ScopedTransaction): Promise<ConnectedAccount[]> {
  const businessId = await currentBusinessId(tx);
  return tx.select().from(connectedAccounts).where(eq(connectedAccounts.businessId, businessId)).orderBy(asc(connectedAccounts.platform));
}

export interface ConnectedAccountInput {
  readonly businessId: string;
  readonly platform: ConnectedPlatform;
  readonly handle: string | null;
  readonly url: string | null;
  readonly status: ConnectedAccountStatus;
  readonly checkedAt: Date | null;
}

/** Staff side: adds the business's account on that platform, or replaces what is stored for it. */
export async function saveConnectedAccount(db: Database, input: ConnectedAccountInput): Promise<ConnectedAccount> {
  if (!isUuid(input.businessId)) throw new Error(`businessId must be a UUID, received "${input.businessId}"`);
  const fields = { handle: input.handle, url: input.url, status: input.status, checkedAt: input.checkedAt };
  const [row] = await db
    .insert(connectedAccounts)
    .values({ businessId: input.businessId, platform: input.platform, ...fields })
    .onConflictDoUpdate({ target: [connectedAccounts.businessId, connectedAccounts.platform], set: { ...fields, updatedAt: new Date() } })
    .returning();
  if (row === undefined) throw new Error("The connected account was not saved.");
  return row;
}

/** Staff side. True when there was a row to remove. */
export async function removeConnectedAccount(
  db: Database,
  input: { readonly businessId: string; readonly platform: ConnectedPlatform },
): Promise<boolean> {
  if (!isUuid(input.businessId)) return false;
  const removed = await db
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.businessId, input.businessId), eq(connectedAccounts.platform, input.platform)))
    .returning({ id: connectedAccounts.id });
  return removed.length > 0;
}

/** Staff side: the console's list for one client. */
export async function listConnectedAccountsForStaff(db: Database, businessId: string): Promise<ConnectedAccount[]> {
  if (!isUuid(businessId)) return [];
  return db.select().from(connectedAccounts).where(eq(connectedAccounts.businessId, businessId)).orderBy(asc(connectedAccounts.platform));
}
