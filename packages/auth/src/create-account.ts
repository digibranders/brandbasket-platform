import { isPhoneAccountEmail, users, type Database } from "@brandbasket/db";
import { eq } from "drizzle-orm";
import { normaliseEmail, withAccountCreationGrant } from "./account-creation-grant";
import type { Auth } from "./create-auth";

export class AccountAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`An account for ${email} already exists.`);
    this.name = "AccountAlreadyExistsError";
  }
}

export interface NewAccount {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export interface CreatedAccount {
  readonly userId: string;
  readonly email: string;
}

/**
 * The only supported way to create an account. With autoSignIn off, Better Auth answers a duplicate email with a
 * generic success and an id that was never stored, so the stored row is checked before anyone relies on the id.
 */
export async function createAccountWithGrant(auth: Auth, db: Database, account: NewAccount): Promise<CreatedAccount> {
  const email = normaliseEmail(account.email);
  // That domain stood for "this account signs in with a phone number": no account is opened that way now, so an address in it is never real.
  if (isPhoneAccountEmail(email)) throw new RangeError("An account's email cannot be in the phone placeholder domain.");
  const result = await withAccountCreationGrant(email, () =>
    auth.api.signUpEmail({ body: { name: account.name, email, password: account.password } }),
  );

  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, result.user.id));
  if (rows.length === 0) {
    throw new AccountAlreadyExistsError(email);
  }

  return { userId: result.user.id, email };
}
