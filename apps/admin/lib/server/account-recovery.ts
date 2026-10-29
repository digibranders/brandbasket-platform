import "server-only";
import { isInvalidTokenError } from "@brandbasket/auth";
import { consumeRateLimit, findActiveStaffMember, findActiveStaffUserIdByEmail } from "@brandbasket/db";
import { createEmailDelivery, createOutboxTransport, EmailConfigurationError } from "@brandbasket/email";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { headers } from "next/headers";
import { after } from "next/server";
import { generateStaffPasswordResetEmail, getAuth } from "./auth";
import { getStaffDb } from "./db";
import { realDeployment } from "./email";

export type ResetRequestOutcome = "accepted" | "limited" | "failed";
export type PasswordResetOutcome = "changed" | "dead-link" | "limited" | "failed";

class ResetMailProbeComplete extends Error {}

/** Neutral responses and an outbox probe avoid revealing membership through delivery failures. */
export async function requestStaffPasswordReset(email: string): Promise<ResetRequestOutcome> {
  try {
    const db = getStaffDb();
    const network = await consumeRateLimit(db, `staff-password-reset:client:${clientIpFrom(await headers())}`, { limit: 6, windowSeconds: 3600 });
    if (!network.allowed) return "limited";
    const address = await consumeRateLimit(db, `staff-password-reset:email:${email}`, { limit: 3, windowSeconds: 3600 });
    if (!address.allowed) return "accepted";

    const production = realDeployment();
    const delivery = createEmailDelivery();
    if (production && delivery === null) throw new EmailConfigurationError("Staff password recovery requires BREVO_API_KEY on a real deployment.");
    try {
      await db.transaction(async (tx) => {
        await createOutboxTransport(tx, { keepLinksForLocalDevelopment: !production }).send({
          to: email, subject: "Reset your Brandbasket password", template: "password-reset",
          bodyText: "Password reset delivery check.", bodyHtml: "<p>Password reset delivery check.</p>",
        });
        throw new ResetMailProbeComplete();
      });
    } catch (error) {
      if (!(error instanceof ResetMailProbeComplete)) throw error;
    }
    // Every address completes the same preflight. Membership, token creation and delivery happen after the
    // response so their timing and failures cannot identify staff accounts.
    after(async () => {
      try {
        if (await findActiveStaffUserIdByEmail(db, email) === null) return;
        const message = await generateStaffPasswordResetEmail(email);
        if (message === null) return;
        await createOutboxTransport(db, { keepLinksForLocalDevelopment: !production }).send(message);
        await delivery?.send(message);
      } catch (error) {
        console.error("A staff password reset email could not be delivered.", errorLogInfo(error));
      }
    });
    return "accepted";
  } catch (error) {
    console.error("Staff password recovery could not be started.", errorLogInfo(error));
    return "failed";
  }
}

/** Recheck active membership; Better Auth atomically consumes the token and revokes existing sessions. */
export async function resetStaffPassword(token: string, newPassword: string): Promise<PasswordResetOutcome> {
  try {
    const db = getStaffDb();
    const budget = await consumeRateLimit(db, `staff-password-reset-use:client:${clientIpFrom(await headers())}`, { limit: 10, windowSeconds: 3600 });
    if (!budget.allowed) return "limited";
    const auth = getAuth();
    const context = await auth.$context;
    const verification = await context.internalAdapter.findVerificationValue(`reset-password:${token}`);
    if (verification === null || verification.expiresAt <= new Date()) return "dead-link";
    if (await findActiveStaffMember(db, verification.value) === null) return "dead-link";
    await auth.api.resetPassword({ body: { token, newPassword } });
    return "changed";
  } catch (error) {
    if (isInvalidTokenError(error)) return "dead-link";
    console.error("A staff password could not be reset.", errorLogInfo(error));
    return "failed";
  }
}
