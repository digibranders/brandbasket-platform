import "server-only";
import {
  AccountAlreadyExistsError,
  createAccountWithGrant,
  PASSWORD_MIN_LENGTH,
} from "@firstfold/auth";
import { claimAffiliateLoginLink, findAffiliateLoginInvite, resetAffiliateCredentialPassword, type AffiliateLoginInvite } from "@firstfold/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@firstfold/shared/lib/client-ip";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";
import { recordAccountTermsConsent } from "./account-consent";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { signInCustomer } from "./signed-in-hint";
import {
  assertWithinSetupRateLimit,
  InviteNotUsableError,
  normaliseEmail,
  TermsNotAgreedError,
  verifyExistingAccount,
  withinSetupViewBudget,
  type SetupViewLimited,
} from "./setup";

/** Same as the client setup: the form's copy of the minimum must agree with Better Auth's, or the form accepts what auth rejects. */
if (SETUP_PASSWORD_MIN_LENGTH !== PASSWORD_MIN_LENGTH) {
  throw new Error(
    `SETUP_PASSWORD_MIN_LENGTH (${SETUP_PASSWORD_MIN_LENGTH}) must match PASSWORD_MIN_LENGTH (${PASSWORD_MIN_LENGTH}) in @firstfold/auth.`,
  );
}

/** The account the link's address already belongs to is a different affiliate's sign-in. */
export class AffiliateAccountTakenError extends Error {
  constructor() {
    super("That account is already an affiliate's.");
    this.name = "AffiliateAccountTakenError";
  }
}

/**
 * The affiliate a login link is for. Null only for a dead link; a spent lookup budget retains its retry time.
 * The lookup spends the same per-network budget as a client's setup link.
 */
export async function findAffiliateInviteForToken(token: string): Promise<AffiliateLoginInvite | SetupViewLimited | null> {
  const budget = await withinSetupViewBudget();
  if (!budget.allowed) return { kind: "limited", retryAfterSeconds: budget.retryAfterSeconds };
  return findAffiliateLoginInvite(getStaffDb(), token);
}

export interface AffiliateAccount {
  readonly name: string;
  readonly password: string;
  readonly mode?: "create" | "verify-existing";
  /** True when the Terms and Privacy Notice box was ticked; a new account is not made without it. */
  readonly agreed?: true;
}

/**
 * Locks and rechecks the one-use link before any credential mutation. Existing affiliate resets claim the token,
 * replace the credential and delete sessions in the same transaction. Any failed reset restores the open token.
 * First-time signup uses Better Auth's account creation flow while the lock is held; sign-in follows the commit.
 */
export async function redeemAffiliateLogin(token: string, account: AffiliateAccount): Promise<{ readonly signedIn: boolean }> {
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);
  await assertWithinSetupRateLimit(clientIp);

  const db = getStaffDb();
  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const invite = await findAffiliateLoginInvite(tx, token, now, "update");
    if (invite === null) throw new InviteNotUsableError();
    const email = normaliseEmail(invite.email);
    let userId: string;
    let signedIn = false;
    if (invite.userId !== null) {
      if (account.mode === "verify-existing") throw new InviteNotUsableError();
      if (account.password.length < PASSWORD_MIN_LENGTH || account.password.length > 128) {
        throw new RangeError(`A password must be ${PASSWORD_MIN_LENGTH} to 128 characters.`);
      }
      const claimed = await claimAffiliateLoginLink(tx, { token, userId: invite.userId, now });
      if (claimed !== "claimed") throw new InviteNotUsableError();
      const context = await getAuth().$context;
      const hash = await context.password.hash(account.password);
      await resetAffiliateCredentialPassword(tx, invite.userId, hash);
      return { email, reset: true, signedIn: false };
    }
    if (account.mode === "verify-existing") {
      const existing = await verifyExistingAccount(email, account.password, clientIp, requestHeaders);
      if (existing === null) throw new AccountAlreadyExistsError(email);
      userId = existing;
      signedIn = true;
    } else {
      // Only a first-time account needs the tick; choosing a new password for an account that exists (above) does not.
      if (account.agreed !== true) throw new TermsNotAgreedError();
      userId = (await createAccountWithGrant(getAuth(), db, { email, name: account.name, password: account.password })).userId;
      await recordAccountTermsConsent(db, userId);
    }
    const claimed = await claimAffiliateLoginLink(tx, { token, userId, now });
    if (claimed === "closed") throw new InviteNotUsableError();
    if (claimed === "user-taken") throw new AffiliateAccountTakenError();
    return { email, reset: false, signedIn };
  });
  if (result.reset) return { signedIn: false };
  if (!result.signedIn) await signInCustomer({ email: result.email, password: account.password }, requestHeaders);
  return { signedIn: true };
}
