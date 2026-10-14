import "server-only";
import { findClientDetail, markProjectLive, type Database } from "@fynix/db";
import { websiteLiveEmail } from "@fynix/email";
import { customerEmailTransport } from "./email";
import type { OwnerNotification } from "./project-preview";

export class ProjectLaunchRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email about going live.`);
    this.name = "ProjectLaunchRecipientMissingError";
  }
}

export class ProjectLaunchDomainMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no domain to launch it on.`);
    this.name = "ProjectLaunchDomainMissingError";
  }
}

export interface LaunchProjectInput {
  readonly businessId: string;
}

/**
 * Marks a business's project live (markProjectLive, which is also the check that it's actually approved and ready)
 * and emails the owner their real website address. The database write happens first, the same shape as
 * sendProjectPreview: a business with no owner, or somehow no domain, is a defensive case only — neither should be
 * reachable given the real flow up to here — but if it happens the project is left marked live without an email
 * having gone out, and this throws rather than silently sending nothing.
 *
 * An owner who signs in with a mobile number has no email address: the project goes live, nothing is emailed, and the
 * answer says so, so the console can tell staff to call or message them (see sendProjectPreview).
 */
export async function launchProject(db: Database, input: LaunchProjectInput, now: Date): Promise<OwnerNotification> {
  await markProjectLive(db, { businessId: input.businessId, now });

  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectLaunchRecipientMissingError(input.businessId);
  if (client.domain === null) throw new ProjectLaunchDomainMissingError(input.businessId);
  if (client.owner.email === null) return "no-email";

  await customerEmailTransport(db).send(
    websiteLiveEmail({
      to: client.owner.email,
      businessName: client.businessName,
      websiteUrl: `https://${client.domain.hostname}`,
    }),
  );
  return "emailed";
}
