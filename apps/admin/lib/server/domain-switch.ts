import "server-only";
import { findClientDetail, switchToDomain, type Database } from "@fynix/db";
import { domainMovedEmail } from "@fynix/email";
import { customerEmailTransport } from "./email";
import type { OwnerNotification } from "./project-preview";

export class DomainSwitchRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email about their new domain.`);
    this.name = "DomainSwitchRecipientMissingError";
  }
}

/**
 * Moves a live customer's website to the domain they connected (switchToDomain, which also checks their DNS was found connected)
 * and emails the owner their new address. The database write comes first, like launchProject: the switch stands whether or not
 * the email goes, and an owner with no email address is told so for staff to call them.
 */
export async function switchDomain(db: Database, input: { readonly businessId: string }): Promise<OwnerNotification> {
  const switched = await switchToDomain(db, input);

  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new DomainSwitchRecipientMissingError(input.businessId);
  if (client.owner.email === null) return "no-email";

  await customerEmailTransport(db).send(
    domainMovedEmail({
      to: client.owner.email,
      businessName: client.businessName,
      websiteUrl: `https://${switched.newHostname}`,
      oldHostname: switched.oldHostname,
    }),
  );
  return "emailed";
}
