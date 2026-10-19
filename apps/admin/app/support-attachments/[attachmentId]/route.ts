import { getSupportAttachmentForStaff } from "@brandbasket/db";
import {
  serveSupportAttachment,
  supportAttachmentUnavailable,
} from "@brandbasket/shared/server/support-attachment-serving";
import { getSupportStorage } from "@brandbasket/shared/server/support-storage";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess, requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  if ((await getStaffAccess()).kind !== "granted")
    return supportAttachmentUnavailable(401);
  const { user } = await requireStaffAccess();
  const { attachmentId } = await context.params;
  await logStaffAccess({ staffUserId: user.id, action: "support_attachment.view", targetType: "support_attachment", targetId: attachmentId });
  return serveSupportAttachment(
    {
      find: (id) => getSupportAttachmentForStaff(getStaffDb(), id),
      storage: getSupportStorage(),
    },
    attachmentId,
  );
}
