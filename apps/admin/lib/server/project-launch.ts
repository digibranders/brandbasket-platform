import "server-only";
import {
  findClientDetail,
  InvalidWebsiteUrlError,
  LAUNCH_CHECK_KEYS,
  listLaunchChecks,
  markProjectLive,
  missingLaunchChecks,
  setBusinessWebsiteUrl,
  setLaunchCheck,
  type Database,
  type LaunchCheckKey,
} from "@brandbasket/db";
import { websiteLiveEmail } from "@brandbasket/email";
import { customerEmailTransport } from "./email";
import type { OwnerNotification } from "./project-preview";

/** How long after going live staff may send the launch email again. */
const LAUNCH_RESEND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

export class ProjectLaunchChecksMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has launch checks that are not ticked yet.`);
    this.name = "ProjectLaunchChecksMissingError";
  }
}

export interface LaunchProjectInput {
  readonly businessId: string;
}

/** What resendLaunchEmail did: the send's outcome, or "not-allowed" when the site is not live within the resend window. */
export type LaunchResend = OwnerNotification | "not-allowed";

/** Emails the website address. Never throws: the site is already live, so a failed send is reported as an outcome. */
async function emailLaunch(
  db: Database,
  input: { readonly businessId: string; readonly to: string; readonly businessName: string; readonly websiteUrl: string },
): Promise<"emailed" | "email-failed"> {
  try {
    await customerEmailTransport(db).send(websiteLiveEmail({ to: input.to, businessName: input.businessName, websiteUrl: input.websiteUrl }));
    return "emailed";
  } catch (error) {
    console.error("[launch-email]", { businessId: input.businessId, error });
    return "email-failed";
  }
}

/**
 * Marks a business's project live (markProjectLive, which is also the check that it's actually approved and ready)
 * and emails the owner their real website address. The client is read first: a business with no owner or no domain
 * throws before anything is written, so the project is never left live with no email and no website address. The
 * launch checks must all be ticked too (ProjectLaunchChecksMissingError); they are read before the project is marked live.
 * The project is marked live only once all of that is present.
 *
 * Their website address is set to the domain they went live on. An owner who signs in with a mobile number has no email address: the project goes live, nothing is emailed, and the
 * answer says so, so the console can tell staff to call or message them (see sendProjectPreview).
 */
export async function launchProject(db: Database, input: LaunchProjectInput, now: Date): Promise<OwnerNotification> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectLaunchRecipientMissingError(input.businessId);
  if (client.domain === null) throw new ProjectLaunchDomainMissingError(input.businessId);

  if (client.project !== null) {
    const ticked = await listLaunchChecks(db, { projectId: client.project.id, businessId: input.businessId });
    if (missingLaunchChecks(ticked.map((check) => check.key)).length > 0) throw new ProjectLaunchChecksMissingError(input.businessId);
  }

  await markProjectLive(db, { businessId: input.businessId, now });

  // From now on their website is at their own address, not the host's: blog previews and links follow it. An address that cannot
  // be stored as one is left as it was; launching never fails over it.
  const websiteUrl = `https://${client.domain.hostname}`;
  try {
    await setBusinessWebsiteUrl(db, input.businessId, websiteUrl);
  } catch (error) {
    if (!(error instanceof InvalidWebsiteUrlError)) throw error;
  }
  if (client.owner.email === null) return "no-email";
  return emailLaunch(db, { businessId: input.businessId, to: client.owner.email, businessName: client.businessName, websiteUrl });
}

/**
 * Sends the website-live email again, to the owner's address and the domain the site went live on. Allowed only while the
 * latest project is live and went live within the last 7 days; nothing on the project changes. "not-allowed" otherwise.
 */
export async function resendLaunchEmail(db: Database, input: LaunchProjectInput): Promise<LaunchResend> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null || client.domain === null) return "not-allowed";
  const project = client.project;
  if (project === null || project.status !== "live" || project.launchedAt === null) return "not-allowed";
  if (Date.now() - project.launchedAt.getTime() > LAUNCH_RESEND_WINDOW_MS) return "not-allowed";
  if (client.owner.email === null) return "no-email";
  return emailLaunch(db, {
    businessId: input.businessId,
    to: client.owner.email,
    businessName: client.businessName,
    websiteUrl: `https://${client.domain.hostname}`,
  });
}

export interface SaveLaunchChecksInput {
  readonly businessId: string;
  /** The staff member ticking the checks, recorded on each tick. */
  readonly staffId: string;
  /** The checks ticked on the form. Every other check is unticked. */
  readonly ticked: readonly LaunchCheckKey[];
  readonly now: Date;
}

/**
 * Saves the launch checks as the form shows them: each check in LAUNCH_CHECK_KEYS is ticked or unticked to match `ticked`.
 * Only a project that is approved takes them; anything else returns "not-allowed" and nothing is written.
 */
export async function saveLaunchChecks(db: Database, input: SaveLaunchChecksInput): Promise<"saved" | "not-allowed"> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.project === null || client.project.status !== "approved") return "not-allowed";
  for (const key of LAUNCH_CHECK_KEYS) {
    await setLaunchCheck(db, {
      projectId: client.project.id,
      businessId: input.businessId,
      key,
      staffId: input.staffId,
      checked: input.ticked.includes(key),
      now: input.now,
    });
  }
  return "saved";
}
