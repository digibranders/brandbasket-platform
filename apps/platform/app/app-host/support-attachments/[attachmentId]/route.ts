import { getSupportAttachmentForUser } from "@fynix/db";
import {
  serveSupportAttachment,
  supportAttachmentUnavailable,
} from "@fynix/shared/server/support-attachment-serving";
import { getSupportStorage } from "@fynix/shared/server/support-storage";
import { getAppDb } from "@/lib/server/db";
import { getSupportAccess } from "@/lib/server/support-access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const access = await getSupportAccess();
  if (access === null) return supportAttachmentUnavailable(401);
  const { attachmentId } = await context.params;
  return serveSupportAttachment(
    {
      find: (id) => getSupportAttachmentForUser(getAppDb(), access.user.id, id),
      storage: getSupportStorage(),
    },
    attachmentId,
  );
}
