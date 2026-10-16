import "server-only";
import { findClientDetail, markDomainReadyForDns, type Database } from "@fynix/db";
import { domainReadyEmail } from "@fynix/email";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";
import type { OwnerNotification } from "./project-preview";

export class DomainReadyRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email about connecting their domain.`);
    this.name = "DomainReadyRecipientMissingError";
  }
}

/** `unchanged`: they had already been asked, so nothing was written and nothing was sent. */
export type DomainReadyOutcome = OwnerNotification | "unchanged";

/**
 * Staff have added the customer's domain to the website's host: moves it to the DNS step (markDomainReadyForDns, which also checks
 * the project is approved) and emails the owner to connect it. The database write comes first, the same shape as sendProjectPreview:
 * the steps show on the customer's dashboard whether or not the email goes. An owner who signs in with a mobile number has no
 * address, and the answer says so for staff to tell them.
 */
export async function markDomainReady(db: Database, input: { readonly businessId: string }): Promise<DomainReadyOutcome> {
  const result = await markDomainReadyForDns(db, input);
  if (!result.changed) return "unchanged";

  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new DomainReadyRecipientMissingError(input.businessId);
  if (client.owner.email === null) return "no-email";

  await customerEmailTransport(db).send(
    domainReadyEmail({
      to: client.owner.email,
      businessName: client.businessName,
      domain: result.hostname,
      projectUrl: new URL("/domain", serverEnv().APP_ORIGIN).toString(),
    }),
  );
  return "emailed";
}
