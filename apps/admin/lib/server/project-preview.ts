import "server-only";
import { findClientDetail, recordPreviewVersion, recordProjectPreviewSent, savePreviewImage, type Database } from "@brandbasket/db";
import { previewReadyEmail } from "@brandbasket/email";
import { customerEmailTransport } from "./email";
import { captureScreenshot } from "./preview-screenshot";
import { addWorkingActivity } from "./website-moves";

export class ProjectPreviewRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email the preview to.`);
    this.name = "ProjectPreviewRecipientMissingError";
  }
}

/**
 * Whether the owner was emailed: an owner who signs in with a mobile number has no address, and staff tell them. "email-failed"
 * means the send itself failed; the preview is saved all the same and staff resend the email from the console.
 */
export type OwnerNotification = "emailed" | "no-email" | "email-failed";

/** What resendPreviewEmail did: the send's outcome, or "not-allowed" when the preview is no longer waiting for the customer. */
export type PreviewResend = OwnerNotification | "not-allowed";

export interface SendProjectPreviewInput {
  readonly businessId: string;
  readonly previewUrl: string;
  /** The staff member sending it, named on the "What we did" line. */
  readonly staffId: string;
}

/**
 * Takes a picture of the preview link and stores it with the project. True when it was stored. Never throws: a missing
 * picture must not stop a preview being sent, the card then shows a plain frame (plan 33, decision 1).
 */
export async function takePreviewPicture(db: Database, input: { readonly projectId: string; readonly businessId: string; readonly previewUrl: string }): Promise<boolean> {
  try {
    const screenshot = await captureScreenshot(input.previewUrl);
    await savePreviewImage(db, { ...input, ...screenshot });
    return true;
  } catch (error) {
    console.error("[preview-picture]", { businessId: input.businessId, error });
    return false;
  }
}

/** Emails the preview link. Never throws: the preview is already saved, so a failed send is reported as an outcome. */
async function emailPreview(
  db: Database,
  input: { readonly businessId: string; readonly to: string; readonly businessName: string; readonly previewUrl: string },
): Promise<"emailed" | "email-failed"> {
  try {
    await customerEmailTransport(db).send(previewReadyEmail({ to: input.to, businessName: input.businessName, previewUrl: input.previewUrl }));
    return "emailed";
  } catch (error) {
    console.error("[preview-email]", { businessId: input.businessId, error });
    return "email-failed";
  }
}

/**
 * Records that staff sent a preview link (recordProjectPreviewSent, which is also the check that the project is
 * actually ready for one) and emails the client's owner. The client is read first: a business with no owner to email
 * throws before anything is written, so no preview is recorded and no line is added. Only then is the preview recorded.
 *
 * After the write it records the preview version, takes a picture of the link (takePreviewPicture, best effort) and adds the
 * dated "What we did" line; none of them can stop the email, and a failed email never undoes the preview.
 *
 * An owner who signs in with a mobile number (a Premium member who joined on the entry page) has no email address. The
 * preview is recorded and shows on their dashboard all the same; nothing is emailed, and the answer says so, so the
 * console can tell staff to call or message them.
 */
export async function sendProjectPreview(db: Database, input: SendProjectPreviewInput, now: Date): Promise<OwnerNotification> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectPreviewRecipientMissingError(input.businessId);

  const project = await recordProjectPreviewSent(db, { businessId: input.businessId, previewUrl: input.previewUrl, now });
  try {
    await recordPreviewVersion(db, { projectId: project.id, businessId: input.businessId, previewUrl: input.previewUrl, sentAt: now, staffId: input.staffId });
  } catch (error) {
    console.error("[preview-version]", { businessId: input.businessId, error });
  }
  await takePreviewPicture(db, { projectId: project.id, businessId: input.businessId, previewUrl: input.previewUrl });
  await addWorkingActivity(db, { businessId: input.businessId, staffId: input.staffId, title: "Your website preview is ready to check", now });

  if (client.owner.email === null) return "no-email";
  return emailPreview(db, { businessId: input.businessId, to: client.owner.email, businessName: client.businessName, previewUrl: input.previewUrl });
}

/**
 * Sends the preview email again, to the link already stored on a project that is still waiting for the customer. Nothing
 * changes on the project: no status move, no new version, no new line. "not-allowed" when there is no such preview or no owner.
 */
export async function resendPreviewEmail(db: Database, input: { readonly businessId: string }): Promise<PreviewResend> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) return "not-allowed";
  const project = client.project;
  if (project === null || project.status !== "preview" || project.previewUrl === null) return "not-allowed";
  if (client.owner.email === null) return "no-email";
  return emailPreview(db, { businessId: input.businessId, to: client.owner.email, businessName: client.businessName, previewUrl: project.previewUrl });
}
