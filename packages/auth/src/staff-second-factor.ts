import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { Auth } from "./create-auth";

/** Why a console sign-in cannot be completed: the account does not exist any more. */
const UNKNOWN_USER_CODE = "UNKNOWN_USER";

/**
 * The console's two-step sign-in needs a session that is made only after the second factor passed, which Better Auth's
 * own password sign-in cannot do: it makes the session the moment the password is right. This adds one endpoint that
 * makes the session, marked with `secondFactorAt`, and sets its cookie.
 *
 * The endpoint is server-only: Better Auth's router never serves it over HTTP, and no app here mounts that router. Only
 * code that has already checked a password and a code can reach it, through `auth.api`.
 */
export function staffSecondFactor() {
  return {
    id: "staff-second-factor",
    schema: {
      session: {
        fields: {
          secondFactorAt: { type: "date", required: false, input: false },
        },
      },
    },
    endpoints: {
      completeStaffSignIn: createAuthEndpoint(
        "/staff/complete-sign-in",
        { method: "POST", body: z.object({ userId: z.string().min(1) }), metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (user === null) throw APIError.from("UNAUTHORIZED", { code: UNKNOWN_USER_CODE, message: "No such account." });
          const session = await ctx.context.internalAdapter.createSession(user.id, false, { secondFactorAt: new Date() });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

export interface VerifiedCredentials {
  readonly userId: string;
  /** As stored: the address the second-factor code goes to. */
  readonly email: string;
}

/**
 * Checks an email and password without starting a session, so a correct password alone gets nothing. An unknown address,
 * an account with no password and a wrong password all return null after the same hashing work, as Better Auth's own
 * sign-in does, so the answer does not say which it was.
 */
export async function verifyCredentials(auth: Auth, email: string, password: string): Promise<VerifiedCredentials | null> {
  const context = await auth.$context;
  const record = await context.internalAdapter.findUserByEmail(email.toLowerCase(), { includeAccounts: true });
  const credential = record?.accounts.find((account) => account.providerId === "credential" && account.accountId === record.user.id);
  const hash = credential?.password;
  if (record === null || hash === null || hash === undefined) {
    await context.password.hash(password);
    return null;
  }
  if (!(await context.password.verify({ hash, password }))) return null;
  return { userId: record.user.id, email: record.user.email };
}
