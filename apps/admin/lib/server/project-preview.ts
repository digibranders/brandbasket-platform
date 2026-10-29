import "server-only";
import { findClientDetail, recordProjectPreviewSent, savePreviewImage, type Database } from "@brandbasket/db";
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

/** Whether the owner was emailed: an owner who signs in with a mobile number has no address, and staff tell them. */
export type OwnerNotification = "emailed" | "no-email";

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

/**
 * Records that staff sent a preview link (recordProjectPreviewSent, which is also the check that the project is
 * actually ready for one) and emails the client's owner. The client is read first: a business with no owner to email
 * throws before anything is written, so no preview is recorded and no line is added. Only then is the preview recorded.
 *
 * After the write it takes a picture of the link (takePreviewPicture, best effort) and adds the dated "What we did" line;
 * neither can stop the email.
 *
 * An owner who signs in with a mobile number (a Premium member who joined on the entry page) has no email address. The
 * preview is recorded and shows on their dashboard all the same; nothing is emailed, and the answer says so, so the
 * console can tell staff to call or message them.
 */
export async function sendProjectPreview(db: Database, input: SendProjectPreviewInput, now: Date): Promise<OwnerNotification> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null || client.owner === null) throw new ProjectPreviewRecipientMissingError(input.businessId);

  const project = await recordProjectPreviewSent(db, { businessId: input.businessId, previewUrl: input.previewUrl, now });
  await takePreviewPicture(db, { projectId: project.id, businessId: input.businessId, previewUrl: input.previewUrl });
  await addWorkingActivity(db, { businessId: input.businessId, staffId: input.staffId, title: "Your website preview is ready to check", now });

  if (client.owner.email === null) return "no-email";

  await customerEmailTransport(db).send(
    previewReadyEmail({ to: client.owner.email, businessName: client.businessName, previewUrl: input.previewUrl }),
  );
  return "emailed";
}
