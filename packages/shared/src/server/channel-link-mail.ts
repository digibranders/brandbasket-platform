import { findChannelLinkMailInfo, isPhoneAccountEmail, type Database } from "@brandbasket/db";
import { channelLinkUpdateEmail, type ChannelLinkUpdate, type EmailTransport } from "@brandbasket/email";
import { inviteSteps, type MetaAppMode } from "../lib/channel-link-steps";

export type ChannelLinkMailOutcome = "sent" | "no-email" | "not-found" | "failed";

/**
 * Tells the person who sent a profile link where it stands: we have it, it is her turn, we could not set it up, or the account is connected.
 * Transactional, so it is sent whatever her email preferences say. A person who signs in with a phone number has no address ("no-email").
 * Best effort: a failure is logged and answered "failed", never thrown, because the answer it reports was already recorded and an email must
 * not undo it. Both the customer app (received, connected) and the admin app (invited, refused, connected) call this one function.
 */
export async function sendChannelLinkUpdate(
  db: Database,
  transport: EmailTransport,
  input: { readonly requestId: string; readonly update: ChannelLinkUpdate; readonly appOrigin: string; readonly mode: MetaAppMode },
): Promise<ChannelLinkMailOutcome> {
  try {
    const info = await findChannelLinkMailInfo(db, input.requestId);
    if (info === null) return "not-found";
    if (info.requester === null || isPhoneAccountEmail(info.requester.email)) return "no-email";
    const { request } = info;
    await transport.send(
      channelLinkUpdateEmail({
        to: info.requester.email,
        name: info.requester.name,
        network: request.network,
        handle: request.handle,
        update: input.update,
        ...(input.update === "invited" ? { steps: inviteSteps(request.network, input.mode).steps } : {}),
        ...(input.update === "refused" ? { reason: request.reason } : {}),
        socialUrl: new URL("/social/review", input.appOrigin).toString(),
      }),
    );
    return "sent";
  } catch (error) {
    console.error("[channel-link] The customer email could not be sent.", error instanceof Error ? error.name : "error");
    return "failed";
  }
}
