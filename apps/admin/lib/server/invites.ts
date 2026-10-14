import "server-only";
import {
  createSetupInvite,
  findLead,
  LeadNotFoundError,
  revokeOpenInvites,
  setLeadStatusUnlessSystemSet,
} from "@fynix/db";
import { setupLinkEmail } from "@fynix/email";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "@/lib/server/env";

export const INVITE_EXPIRY_DAYS = 7;

/**
 * Issues a fresh setup link for a lead and emails it. Revoking any earlier link and creating the new one happen in
 * a single transaction, so two staff sending the link for the same lead at once cannot both end up with a usable
 * link: the loser's invite is revoked by the winner's transaction before or after it commits, never left open
 * alongside it.
 */
export async function sendSetupLink(leadId: string, staffUserId: string): Promise<void> {
  const db = getStaffDb();
  const lead = await findLead(db, leadId);
  if (lead === null) throw new LeadNotFoundError(leadId);

  const created = await db.transaction(async (tx) => {
    // One transaction, so a lead can never be left with both the old invite revoked and no new one.
    await revokeOpenInvites(tx, leadId);
    return createSetupInvite(tx, {
      leadId,
      email: lead.email,
      businessName: lead.businessName,
      createdByStaffId: staffUserId,
      expiresInDays: INVITE_EXPIRY_DAYS,
    });
  });

  await customerEmailTransport(db).send(
    setupLinkEmail({
      to: lead.email,
      businessName: lead.businessName,
      setupUrl: new URL(`/setup/${created.token}`, serverEnv().APP_ORIGIN).toString(),
      expiresInDays: INVITE_EXPIRY_DAYS,
    }),
  );

  // A lead whose account already exists (or who has paid) keeps that status: re-sending a link must not undo it.
  await setLeadStatusUnlessSystemSet(db, leadId, "invite_sent");
}
