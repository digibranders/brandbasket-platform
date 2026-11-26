import "server-only";
import { markChannelLinkNotified, type ChannelLinkNetwork } from "@brandbasket/db";
import { channelLinkRequestedEmail, createAppEmailTransport, emailTeamInboxDefault, type ChannelLinkUpdate } from "@brandbasket/email";
import type { SessionUser } from "@brandbasket/shared/lib/access";
import { sendChannelLinkUpdate } from "@brandbasket/shared/server/channel-link-mail";
import { metaAppModeOf } from "@brandbasket/shared/lib/channel-link-steps";
import { adminOrigin } from "@/features/checkout/server/admin-origin";
import { customerEmailTransport } from "@/features/server-common/email";
import { serverEnv } from "@/lib/env";
import { getStaffDb } from "@/lib/db";

/** Where the team is told about a new profile link: CHANNEL_REQUEST_EMAIL, else the support inbox, else the team inbox. */
function inbox(): string {
  return process.env.CHANNEL_REQUEST_EMAIL?.trim() || process.env.SUPPORT_ALERT_EMAIL?.trim() || process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
}

/**
 * Tells the team, by email, that a customer sent the link to her profile. Best effort: it runs after the request is saved, logs and never throws,
 * so a failed email never undoes what the customer did. Staff connection, because the customer role cannot write the outbox.
 */
export async function tellTeamAboutLink(input: { readonly id: string; readonly businessName: string; readonly network: ChannelLinkNetwork; readonly url: string; readonly handle: string; readonly adminProfileUrl: string | null; readonly user: Pick<SessionUser, "name" | "email"> }): Promise<void> {
  try {
    const db = getStaffDb();
    await createAppEmailTransport(db).send(
      channelLinkRequestedEmail({ to: inbox(), businessName: input.businessName, network: input.network, profileUrl: input.url, handle: input.handle, adminProfileUrl: input.adminProfileUrl, requesterName: input.user.name, requesterEmail: input.user.email, adminUrl: `${adminOrigin()}/clients/channel-requests` }),
    );
    await markChannelLinkNotified(db, input.id, new Date());
  } catch (error) {
    console.error("[social] The channel link email could not be sent.", error instanceof Error ? error.name : "error");
  }
}

/** Tells the person who sent the link where it stands (we have it, the account is connected). Best effort, transactional, never throws. */
export async function tellRequesterAboutLink(requestId: string, update: ChannelLinkUpdate): Promise<void> {
  const db = getStaffDb();
  await sendChannelLinkUpdate(db, customerEmailTransport(db), { requestId, update, appOrigin: serverEnv().APP_ORIGIN, mode: metaAppModeOf(process.env.META_APP_MODE) });
}
