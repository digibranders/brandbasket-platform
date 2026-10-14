import type { Database } from "@firstfold/db";
import { createAccountWithGrant, type CreatedAccount, type NewAccount } from "./create-account";
import type { Auth } from "./create-auth";

/**
 * Opens an account that signs in with an email address its owner has just proven is theirs, by a code sent to it, so the
 * address is stored as confirmed and no confirmation link is ever sent. Refuses an address that already has an account
 * (AccountAlreadyExistsError) and one in the phone placeholder domain (RangeError), as createAccountWithGrant does.
 */
export async function createVerifiedEmailAccountWithGrant(auth: Auth, db: Database, account: NewAccount): Promise<CreatedAccount> {
  const created = await createAccountWithGrant(auth, db, account);
  const context = await auth.$context;
  await context.internalAdapter.updateUser(created.userId, { emailVerified: true });
  return created;
}
