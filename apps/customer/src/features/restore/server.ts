import "server-only";
import { restoreAccountClosure } from "@brandbasket/db";
import type { SessionUser } from "@brandbasket/shared/lib/access";
import { getEntryAccess } from "@/features/entry/server/entry-access";
import { getStaffDb } from "@/lib/db";

/*
 * The closing account's side of restore and Keep my plan. Ported from apps/platform lib/server/account-exit.ts
 * (restoreAccountFor). Staff connection: account_closures is staff-only; only the signed-in user's own closure is ever read
 * or lifted, by the session's user id.
 */

export interface ClosingAccount {
  readonly user: SessionUser;
  readonly eraseAfter: Date;
}

/** The signed-in user's open closure, or null when the account is not closing. The caller has run requireSignedIn. */
export async function findClosingAccount(): Promise<ClosingAccount | null> {
  const access = await getEntryAccess();
  return access.kind === "closing" ? { user: access.user, eraseAfter: access.eraseAfter } : null;
}

/** Brings a closing account back: lifts its own closure. */
export async function restoreAccountFor(userId: string, now: Date): Promise<boolean> {
  return restoreAccountClosure(getStaffDb(), { userId, now });
}
