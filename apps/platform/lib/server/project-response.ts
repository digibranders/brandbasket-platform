import "server-only";
import { approveProjectPreview, requestProjectRevisions, type Database } from "@brandbasket/db";
import { createAppEmailTransport, previewApprovedEmail, previewRevisionsRequestedEmail } from "@brandbasket/email";
import { serverEnv } from "./env";

export type PreviewResponse = { readonly kind: "approve" } | { readonly kind: "revisions" };

export interface RespondToPreviewInput {
  readonly businessId: string;
  readonly businessName: string;
  readonly response: PreviewResponse;
}

/**
 * Records the customer's response to a preview (approveProjectPreview or requestProjectRevisions) and notifies the
 * team. The notification is best-effort and comes after the database write has already committed: a failed email
 * must never undo or block a response the customer has already given — mirrors notifyTeam in lib/server/leads.ts.
 */
export async function respondToPreview(db: Database, input: RespondToPreviewInput, now: Date): Promise<void> {
  if (input.response.kind === "approve") {
    await approveProjectPreview(db, { businessId: input.businessId, now });
  } else {
    await requestProjectRevisions(db, { businessId: input.businessId, now });
  }

  const teamInbox = process.env.BRANDBASKET_TEAM_EMAIL;
  if (teamInbox === undefined || teamInbox.trim() === "") {
    console.error("BRANDBASKET_TEAM_EMAIL is not set, so nobody was told about a preview response.", {
      businessId: input.businessId,
    });
    return;
  }

  const clientUrl = new URL(`/clients/${input.businessId}`, serverEnv().ADMIN_ORIGIN).toString();
  try {
    await createAppEmailTransport(db).send(
      input.response.kind === "approve"
        ? previewApprovedEmail({ to: teamInbox, businessName: input.businessName, clientUrl })
        : previewRevisionsRequestedEmail({ to: teamInbox, businessName: input.businessName, clientUrl }),
    );
  } catch (error) {
    console.error("A preview response was recorded but the team notification failed.", {
      businessId: input.businessId,
      error,
    });
  }
}
