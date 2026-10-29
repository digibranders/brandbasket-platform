import "server-only";
import { findClientDetail, InvalidWebsiteUrlError, markProjectLive, setBusinessWebsiteUrl, type Database } from "@brandbasket/db";
import { websiteLiveEmail } from "@brandbasket/email";
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
 * and emails the owner their real website address. The client is read first: a business with no owner or no domain
 * throws before anything is written, so the project is never left live with no email and no website address. The
 * project is marked live only once both are present.
 *
 * Their website address is set to the domain they went live on. An owner who signs in with a mobile number has no email address: the project goes live, nothing is emailed, and the
 * answer says so, so the console can tell staff to call or message them (see sendProjectPreview).
 */
export async function launchProject(db: Database, input: LaunchProjectInput, now: Date): Promise<OwnerNotification> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectLaunchRecipientMissingError(input.businessId);
  if (client.domain === null) throw new ProjectLaunchDomainMissingError(input.businessId);

  await markProjectLive(db, { businessId: input.businessId, now });

  // From now on their website is at their own address, not the host's: blog previews and links follow it. An address that cannot
  // be stored as one is left as it was; launching never fails over it.
  try {
    await setBusinessWebsiteUrl(db, input.businessId, `https://${client.domain.hostname}`);
  } catch (error) {
    if (!(error instanceof InvalidWebsiteUrlError)) throw error;
  }
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
