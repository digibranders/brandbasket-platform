import { getSupportAttachmentForUser } from "@brandbasket/db";
import { serveSupportAttachment } from "@brandbasket/shared/server/support-attachment-serving";
import { getSupportStorage } from "@brandbasket/shared/server/support-storage";
import { getAppDb } from "@/lib/db";
import { requireSignedIn } from "@/lib/guards";

/** A screenshot in a request's conversation, for the person who owns it only. Links stored in messages keep this path. */
export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }): Promise<Response> {
  const { user } = await requireSignedIn();
  const { attachmentId } = await context.params;
  return serveSupportAttachment({ find: (id) => getSupportAttachmentForUser(getAppDb(), user.id, id), storage: getSupportStorage() }, attachmentId);
}
