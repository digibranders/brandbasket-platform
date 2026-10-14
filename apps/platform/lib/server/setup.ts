import "server-only";
import {
  AccountAlreadyExistsError,
  createAccountWithGrant,
  isInvalidCredentialsError,
  PASSWORD_MIN_LENGTH,
} from "@fynix/auth";
import {
  consumeRateLimit,
  findRedeemableInvite,
  redeemInviteIntoBusiness,
  type Database,
  type SetupInvite,
} from "@fynix/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@fynix/shared/lib/client-ip";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";
import { retryMessage } from "@fynix/shared/lib/sign-in-limits";
import { recordAccountTermsConsent } from "./account-consent";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { signInCustomer } from "./customer-sign-in";
import { firstBlockedSignInLimit } from "@fynix/shared/server/rate-limits";

const SETUP_ATTEMPT_LIMIT = 10;
/** Opening the link is cheap and repeatable (a re-read email, a refresh), so the page gets a wider budget. */
const SETUP_LOOKUP_LIMIT = 60;
const ONE_HOUR_SECONDS = 60 * 60;

/**
 * lib/setup-form.ts carries its own copy of the minimum password length so that it stays browser-safe. This is
 * the server module that sees both, so a drift fails at module load rather than letting the form accept a
 * password Better Auth would then reject.
 */
function assertPasswordRulesAgree(formMinimum: number, authMinimum: number): void {
  if (formMinimum !== authMinimum) {
    throw new Error(
      `SETUP_PASSWORD_MIN_LENGTH (${formMinimum}) must match PASSWORD_MIN_LENGTH (${authMinimum}) in @fynix/auth.`,
    );
  }
}
assertPasswordRulesAgree(SETUP_PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH);

export class InviteNotUsableError extends Error {
  /** Developer-facing only: the setup action owns the one message every dead-link case shows the customer. */
  constructor() {
    super("No redeemable setup invite for this token.");
    this.name = "InviteNotUsableError";
  }
}

export class TooManySetupAttemptsError extends Error {
  constructor(retryAfterSeconds: number) {
    super(retryMessage(retryAfterSeconds));
    this.name = "TooManySetupAttemptsError";
  }
}

/**
 * The staff connection on an unauthenticated page, against the rule in ./db.ts, because setup invites, leads and
 * businesses are staff-only by design: the customer has no account yet, so no row-level security scope exists to
 * read the invite under. What keeps it safe is that nothing here takes a caller-chosen identifier: the only input
 * is the setup token, every query is keyed by its hash or by the invite that hash found, and both the lookup and
 * the redemption are rate limited per network.
 */
function staffDbForSetup(): Database {
  return getStaffDb();
}

/** The request headers Next hands to a server component or action; Better Auth reads and writes cookies through them. */
export type RequestHeaders = Awaited<ReturnType<typeof headers>>;

/** Matches how @fynix/auth stores addresses and how parseSignInForm keys the sign-in limits. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Looks up the invite behind a setup link for the page that renders it. The lookup is unauthenticated and runs on
 * every request, so it gets its own hourly per-network budget, kept on a different key from the redemption budget
 * so that reloading the page cannot spend the customer's attempts at submitting the form. Temporary limits
 * retain their retry timing and never turn a usable token into a dead-link result.
 */
export interface SetupViewLimited {
  readonly kind: "limited";
  readonly retryAfterSeconds: number;
}

export async function findInviteForToken(token: string): Promise<SetupInvite | SetupViewLimited | null> {
  const budget = await withinSetupViewBudget();
  if (!budget.allowed) return { kind: "limited", retryAfterSeconds: budget.retryAfterSeconds };
  return findRedeemableInvite(staffDbForSetup(), token);
}

/** Spends one of the network's hourly setup-page lookups. Shared by every setup link. */
export async function withinSetupViewBudget(): Promise<{ readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number }> {
  const budget = await consumeRateLimit(staffDbForSetup(), `setup-view:client:${clientIpFrom(await headers())}`, {
    limit: SETUP_LOOKUP_LIMIT,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  return budget.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: budget.retryAfterSeconds };
}

export interface SetupAccount {
  readonly name: string;
  readonly password: string;
  readonly mode?: "create" | "verify-existing";
  /** True when the Terms and Privacy Notice box was ticked; a new account is not made without it. */
  readonly agreed?: true;
}

/** A new account was asked for without the box for the Terms and Privacy Notice ticked. */
export class TermsNotAgreedError extends Error {
  constructor() {
    super("The Terms and Privacy Notice box was not ticked.");
    this.name = "TermsNotAgreedError";
  }
}

/**
 * Consumes the per-network redemption budget before the invite is even looked up, so guessing tokens through this
 * page is bounded by network rather than by how many invites happen to exist.
 */
export async function assertWithinSetupRateLimit(clientIp: string): Promise<void> {
  const result = await consumeRateLimit(staffDbForSetup(), `setup:client:${clientIp}`, {
    limit: SETUP_ATTEMPT_LIMIT,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  if (!result.allowed) throw new TooManySetupAttemptsError(result.retryAfterSeconds);
}

interface RedeemingUser {
  readonly userId: string;
  /** The recovery path proves the password by signing in, so that session is already established. */
  readonly signedIn: boolean;
}

/**
 * Proves that whoever submitted the form owns the account the invite's email already has, and returns its user id.
 * Returns null for a wrong password, which the caller turns back into the unchanged "you already have an account"
 * message: nothing here ever says whether an account exists, only the caller's own single message does.
 *
 * This is a password check on an unauthenticated page, so it consumes the very same limits the sign-in page
 * consumes, keyed the same way. Guessing a password here is therefore no cheaper than guessing it at sign-in, and
 * it costs the attacker a setup-redemption attempt on top; a valid, still-open setup token is needed to reach this
 * code at all, and it can only ever probe that invite's own email.
 */
export async function verifyExistingAccount(
  email: string,
  password: string,
  clientIp: string,
  requestHeaders: RequestHeaders,
): Promise<string | null> {
  const blocked = await firstBlockedSignInLimit(staffDbForSetup(), email, clientIp);
  if (blocked !== null) throw new TooManySetupAttemptsError(blocked.retryAfterSeconds);

  try {
    return (await signInCustomer({ email, password }, requestHeaders)).userId;
  } catch (error) {
    // Only a genuine credentials failure means "not their account"; any other auth fault is a real error.
    if (isInvalidCredentialsError(error)) return null;
    throw error;
  }
}

/**
 * Creates the account for the invite, or verifies an existing account in the explicit linking step.
 *
 * The account is committed before the business is, so a redemption that fails in between (a resend revoking the
 * invite mid-submit, an expiry landing between the two, a dropped connection) used to strand the customer: the
 * link then answered "you already have an account" forever. A duplicate creation attempt now returns to an
 * explicit current-password step; only proving ownership there finishes the job.
 *
 * Proving it establishes the session before the business exists, so a redemption that fails again leaves the
 * customer signed in and looking at the "no business yet" notice, which staff can then repair from the lead.
 */
async function createOrRecoverAccount(
  invite: SetupInvite,
  account: SetupAccount,
  clientIp: string,
  requestHeaders: RequestHeaders,
): Promise<RedeemingUser> {
  if (account.mode === "verify-existing") {
    const userId = await verifyExistingAccount(normaliseEmail(invite.email), account.password, clientIp, requestHeaders);
    if (userId === null) throw new AccountAlreadyExistsError(normaliseEmail(invite.email));
    return { userId, signedIn: true };
  }
  if (account.agreed !== true) throw new TermsNotAgreedError();
  const created = await createAccountWithGrant(getAuth(), staffDbForSetup(), {
    email: invite.email,
    name: account.name,
    password: account.password,
  });
  await recordAccountTermsConsent(staffDbForSetup(), created.userId);
  return { userId: created.userId, signedIn: false };
}

/**
 * Creates the account, the business and the owner membership for a valid setup link, then signs the customer in.
 * The invite is re-read here, so a link redeemed in another tab cannot be used twice: `redeemInviteIntoBusiness`
 * closes the invite as its transaction's gate and throws `InviteNoLongerRedeemableError` if two submissions race,
 * which the caller handles alongside `InviteNotUsableError`.
 *
 * Once the business exists, `syncTenantForBusiness` gives it a matching Payload tenant (see that function for what
 * happens if Payload itself is unreachable) — this is one of two places a business is created; the other is the
 * admin-host "attach account" staff repair action, which does the same.
 */
export async function redeemSetupInvite(token: string, account: SetupAccount): Promise<void> {
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);
  await assertWithinSetupRateLimit(clientIp);

  const db = staffDbForSetup();
  const invite = await findRedeemableInvite(db, token);
  if (invite === null) throw new InviteNotUsableError();

  const redeeming = await createOrRecoverAccount(invite, account, clientIp, requestHeaders);

  const { businessId } = await redeemInviteIntoBusiness(db, {
    inviteId: invite.id,
    leadId: invite.leadId,
    businessName: invite.businessName,
    userId: redeeming.userId,
  });
  await syncTenantForBusiness({ businessId, name: invite.businessName });

  if (redeeming.signedIn) return;
  await signInCustomer({ email: normaliseEmail(invite.email), password: account.password }, requestHeaders);
}
