import "server-only";
import { AccountAlreadyExistsError, createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import { BreachCheckUnavailableError, breachedPasswordCount } from "@brandbasket/auth/breached-password";
import { addStaffMember, claimStaffInvite, consumeRateLimit, findUserIdByEmail, findUsableStaffInvite, type StaffInvite } from "@brandbasket/db";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { retryMessage } from "@brandbasket/shared/lib/sign-in-limits";
import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { getSessionUser } from "./session";

/** Opening the link is cheap and repeatable, so viewing gets a wider budget than submitting. */
const VIEW_LIMIT = 60;
const ATTEMPT_LIMIT = 10;
const ONE_HOUR_SECONDS = 60 * 60;

const GONE = "This invite no longer works. Ask an admin for a new one.";
const SIGN_IN_FIRST = "This email already has an account. Sign in with it, then open this link again.";
const WRONG_ACCOUNT = "You are signed in with a different account. Sign out, then open this link again.";

/**
 * How to show the page: create an account, join with the signed-in account, sign in first, or sign out first. This page
 * is unauthenticated and uses the staff connection, which is safe because the only input is the token: every query is
 * keyed by its hash or by the invite that hash found, and both viewing and submitting are limited per network.
 */
export type StaffInviteView =
  | { readonly kind: "limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "gone" }
  | { readonly kind: "ready"; readonly invite: StaffInvite; readonly mode: "create" | "join" | "sign-in-first" | "wrong-account" };

export type StaffAcceptOutcome =
  | { readonly status: "joined" }
  | { readonly status: "error"; readonly message: string; readonly field?: "name" | "password" | "confirm" };

async function within(key: string, limit: number): Promise<{ readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number }> {
  const ip = clientIpFrom(await headers());
  const result = await consumeRateLimit(getStaffDb(), `${key}:client:${ip}`, { limit, windowSeconds: ONE_HOUR_SECONDS });
  return result.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}

async function modeFor(invite: StaffInvite): Promise<"create" | "join" | "sign-in-first" | "wrong-account"> {
  const session = await getSessionUser();
  if (session !== null) return session.email.trim().toLowerCase() === invite.email ? "join" : "wrong-account";
  return (await findUserIdByEmail(getStaffDb(), invite.email)) === null ? "create" : "sign-in-first";
}

export async function viewStaffInvite(token: string): Promise<StaffInviteView> {
  const budget = await within("staff-invite-view", VIEW_LIMIT);
  if (!budget.allowed) return { kind: "limited", retryAfterSeconds: budget.retryAfterSeconds };
  const invite = await findUsableStaffInvite(getStaffDb(), token);
  if (invite === null) return { kind: "gone" };
  return { kind: "ready", invite, mode: await modeFor(invite) };
}

/**
 * Joins the console through an invite. `form` is the new account's name and password, already checked against the
 * password rule (lib/staff-accept-form.ts); it is null when the signed-in owner of the address joins with one click.
 */
export async function acceptStaffInvite(token: string, form: { readonly name: string; readonly password: string } | null): Promise<StaffAcceptOutcome> {
  const budget = await within("staff-invite", ATTEMPT_LIMIT);
  if (!budget.allowed) return { status: "error", message: retryMessage(budget.retryAfterSeconds) };
  const db = getStaffDb();
  const invite = await findUsableStaffInvite(db, token);
  if (invite === null) return { status: "error", message: GONE };

  const mode = await modeFor(invite);
  if (mode === "wrong-account") return { status: "error", message: WRONG_ACCOUNT };
  if (mode === "sign-in-first") return { status: "error", message: SIGN_IN_FIRST };

  let userId: string;
  if (mode === "join") {
    const session = await getSessionUser();
    if (session === null) return { status: "error", message: GONE };
    userId = session.id;
  } else {
    if (form === null) return { status: "error", message: "Choose a password.", field: "password" };
    try {
      if ((await breachedPasswordCount(form.password)) > 0) {
        return { status: "error", message: "That password appears in known data breaches. Choose another.", field: "password" };
      }
    } catch (error) {
      // An unchecked password is not accepted, as with pnpm staff:create.
      if (error instanceof BreachCheckUnavailableError) return { status: "error", message: "We couldn't check that password right now. Try again in a minute.", field: "password" };
      throw error;
    }
    try {
      userId = (await createVerifiedEmailAccountWithGrant(getAuth(), db, { email: invite.email, name: form.name, password: form.password })).userId;
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) return { status: "error", message: SIGN_IN_FIRST };
      throw error;
    }
  }

  // The claim is the gate: if another tab used the link first, nobody is added (an account made just now stays without access).
  if (!(await claimStaffInvite(db, invite.id))) return { status: "error", message: GONE };
  await addStaffMember(db, { userId, role: invite.role });
  if (mode === "create" && form !== null) {
    await getAuth().api.signInEmail({ body: { email: invite.email, password: form.password }, headers: await headers() });
  }
  return { status: "joined" };
}
