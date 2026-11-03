import "server-only";
import { findRequestRecipient, type Database } from "@brandbasket/db";
import { changeRequestUpdateEmail, type ChangeRequestUpdate } from "@brandbasket/email";
import { emailPreferenceAllows } from "@brandbasket/shared/server/email-preference";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { MailOutcome } from "@/lib/request-notices";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";

/**
 * Tells the person who asked what happened to their request: a reply, a quote, work started, ready to check, done, closed.
 * The request's page opens from the email. A person who signs in with a phone number has no address ("no-email": the console
 * tells staff to reach them another way). A person who turned "replies to my requests" emails off for the request's business gets
 * none, and the answer is the same "no-email". A failure to send is logged and reported as "failed", never thrown: the change has
 * already been made, and an email must not undo it.
 */
export async function notifyRequester(db: Database, ticketId: string, update: ChangeRequestUpdate): Promise<MailOutcome> {
  try {
    const recipient = await findRequestRecipient(db, ticketId);
    if (recipient === null) return "failed";
    if (recipient.email === null) return "no-email";
    if (
      recipient.businessId !== null &&
      !(await emailPreferenceAllows(db, recipient.userId, recipient.businessId, "request_reply", (error) =>
        console.error("[request-notify] could not read the email preference, sending anyway", errorLogInfo(error)),
      ))
    ) {
      return "no-email";
    }
    await customerEmailTransport(db).send(
      changeRequestUpdateEmail({
        to: recipient.email,
        name: recipient.name,
        title: recipient.subject,
        requestUrl: new URL(`/requests?open=${ticketId}`, serverEnv().APP_ORIGIN).toString(),
        update,
      }),
    );
    return "emailed";
  } catch (error) {
    console.error("[request-notify] could not email the requester", errorLogInfo(error));
    return "failed";
  }
}
