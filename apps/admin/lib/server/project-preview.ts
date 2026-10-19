import "server-only";
import { findClientDetail, recordProjectPreviewSent, type Database } from "@brandbasket/db";
import { previewReadyEmail } from "@brandbasket/email";
import { customerEmailTransport } from "./email";

export class ProjectPreviewRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email the preview to.`);
    this.name = "ProjectPreviewRecipientMissingError";
  }
}

/** Whether the owner was emailed: an owner who signs in with a mobile number has no address, and staff tell them. */
export type OwnerNotification = "emailed" | "no-email";

export interface SendProjectPreviewInput {
  readonly businessId: string;
  readonly previewUrl: string;
}

/**
 * Records that staff sent a preview link (recordProjectPreviewSent, which is also the check that the project is
 * actually ready for one) and emails the client's owner. The database write happens first: a business with no owner
 * to email is a defensive case only — a project cannot reach a previewable status without one in the real
 * onboarding flow — but if it somehow happens, the project is left marked as having a preview sent without an email
 * having gone out, and this throws rather than silently sending nothing.
 *
 * An owner who signs in with a mobile number (a Premium member who joined on the entry page) has no email address. The
 * preview is recorded and shows on their dashboard all the same; nothing is emailed, and the answer says so, so the
 * console can tell staff to call or message them.
 */
export async function sendProjectPreview(db: Database, input: SendProjectPreviewInput, now: Date): Promise<OwnerNotification> {
  await recordProjectPreviewSent(db, { businessId: input.businessId, previewUrl: input.previewUrl, now });

  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectPreviewRecipientMissingError(input.businessId);

  if (client.owner.email === null) return "no-email";

  await customerEmailTransport(db).send(
    previewReadyEmail({ to: client.owner.email, businessName: client.businessName, previewUrl: input.previewUrl }),
  );
  return "emailed";
}
