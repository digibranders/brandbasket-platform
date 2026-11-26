import { users, type Database } from "@brandbasket/db";
import { eq } from "drizzle-orm";
import { createAccountWithGrant, type CreatedAccount, type NewAccount } from "./create-account";
import type { Auth } from "./create-auth";

/**
 * Opens an account whose owner has not chosen a password (the checkout, plan 64): the caller passes a random one, and the
 * account is marked pending until the owner sets their own through a reset link. The email stays unconfirmed until then.
 * Refuses a duplicate or placeholder-domain address as createAccountWithGrant does.
 */
export async function createPendingPasswordAccountWithGrant(auth: Auth, db: Database, account: NewAccount): Promise<CreatedAccount> {
  const created = await createAccountWithGrant(auth, db, account);
  await db.update(users).set({ passwordPending: true }).where(eq(users.id, created.userId));
  return created;
}
