import { phoneAccountEmail, users, type Database } from "@fynix/db";
import { eq } from "drizzle-orm";
import { withAccountCreationGrant } from "./account-creation-grant";
import { AccountAlreadyExistsError, type CreatedAccount } from "./create-account";
import { PASSWORD_MIN_LENGTH, type Auth } from "./create-auth";

/** Better Auth's own ceiling for a password. */
const PASSWORD_MAX_LENGTH = 128;

export interface NewPhoneAccount {
  /** E.164, and already proven to be the owner's by a code texted to it. */
  readonly phone: string;
  readonly name: string;
  readonly password: string;
}

/**
 * Opens an account that signs in with a phone number. The caller has already confirmed the code texted to the number,
 * so it is stored as verified. Better Auth still needs an address to sign in by: the account gets the number's
 * placeholder (phoneAccountEmail), which nothing is ever sent to. Refuses a number that already has an account.
 */
export async function createPhoneAccountWithGrant(auth: Auth, db: Database, account: NewPhoneAccount): Promise<CreatedAccount> {
  const email = phoneAccountEmail(account.phone);
  const result = await withAccountCreationGrant(email, () =>
    auth.api.signUpEmail({
      body: { name: account.name, email, password: account.password, phoneNumber: account.phone, phoneNumberVerified: true },
    }),
  );

  // With autoSignIn off a duplicate address is answered with a generic success and an id that was never stored.
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, result.user.id));
  if (rows.length === 0) throw new AccountAlreadyExistsError(account.phone);
  return { userId: result.user.id, email };
}

/**
 * Sets a new password for an account whose owner has just proven, by a code texted to their number, that it is theirs,
 * and signs every device out of it: the same as a reset by email, without the emailed token.
 */
export async function setAccountPassword(auth: Auth, userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    throw new RangeError(`A password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
  }
  const context = await auth.$context;
  const hash = await context.password.hash(newPassword);
  await context.internalAdapter.updatePassword(userId, hash);
  await context.internalAdapter.deleteUserSessions(userId);
}
