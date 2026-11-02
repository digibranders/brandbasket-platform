import "server-only";
import { isPhoneAccountEmail } from "@brandbasket/db";
import { previewChangesReceivedEmail } from "@brandbasket/email";
import { workingDayOf } from "@brandbasket/shared/lib/working-days";
import { shortDay } from "@/lib/call-dates";
import { revisionDue } from "@/lib/website/progress-view";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";

export interface PreviewChangesReceived {
  /** The signed-in customer: the person who sent the changes. */
  readonly user: { readonly name: string | null; readonly email: string };
  readonly body: string;
  /** The round these changes use, and how many rounds the project includes. */
  readonly round: number;
  readonly rounds: number;
  readonly now: Date;
}

/**
 * Tells the customer the team has their changes on a preview, and when the new one is promised: the same day the Website page shows
 * once the project is in Revisions (two working days after the day they asked). Call it once, when the feedback ticket was created.
 * A phone-only account has no address to write to. Best-effort: it never throws, because the changes are already saved.
 */
export async function sendPreviewChangesReceived(input: PreviewChangesReceived): Promise<void> {
  if (isPhoneAccountEmail(input.user.email)) return;
  try {
    await customerEmailTransport(getStaffDb()).send(
      previewChangesReceivedEmail({
        to: input.user.email,
        name: input.user.name,
        round: input.round,
        rounds: Math.max(input.rounds, input.round),
        text: input.body,
        readyBy: shortDay(revisionDue(workingDayOf(input.now))),
      }),
    );
  } catch (error) {
    console.error("[preview-changes-email] The customer's changes were saved but their confirmation email failed.", { error: error instanceof Error ? error.name : "error" });
  }
}
