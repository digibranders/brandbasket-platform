import {
  consumeRateLimit,
  confirmSupportAttachmentUpload,
  findOpenClosureForUser,
  getStagedSupportAttachment,
  markSupportAttachmentDeleted,
  markSupportAttachmentPurged,
  stageSupportAttachment,
  withSupportUploadLock,
} from "@firstfold/db";
import { getSupportStorage } from "@firstfold/shared/server/support-storage";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { getSupportAccess } from "@/lib/server/support-access";
import {
  deleteStagedSupportUpload,
  handleSupportUploadRequest,
} from "@/lib/server/support-uploads";
import { purgeSupportAttachments } from "@firstfold/shared/server/support-attachment-maintenance";
import {
  refuseUpload,
  refuseUploadEnvelope,
} from "@/lib/server/upload-request";
import { allowsAnyLocalHost } from "@/lib/surfaces";

/** Session-based support access includes affiliates and users awaiting payment; no billing guard applies. */
export async function POST(request: Request): Promise<Response> {
  return handleSupportUploadRequest(request, {
    // The lock transaction holds no staging writes: their independent commits preserve the deletion manifest even if releasing this lock fails.
    withUploadLock: (userId, work) =>
      withSupportUploadLock(getStaffDb(), userId, () => work()),
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    getRequester: async () => (await getSupportAccess())?.user ?? null,
    isClosing: async (userId) =>
      (await findOpenClosureForUser(getStaffDb(), userId)) !== null,
    consumeAllowance: (userId) =>
      consumeRateLimit(getAppDb(), `support-upload:user:${userId}`, {
        limit: 20,
        windowSeconds: 3600,
      }),
    confirm: (userId, id) =>
      confirmSupportAttachmentUpload(getStaffDb(), userId, id),
    stage: async (attachment) => {
      await stageSupportAttachment(getAppDb(), attachment);
    },
    markDeleting: async (userId, id) => {
      await markSupportAttachmentDeleted(getAppDb(), userId, id);
    },
    storage: getSupportStorage(),
  });
}

/** Removes only owned staged images; attached ticket images are immutable from this endpoint. */
export async function DELETE(request: Request): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set("content-length", "0");
  const envelope = new Request(request.url, { headers });
  const refused = refuseUploadEnvelope(
    envelope,
    serverEnv().APP_ORIGIN,
    allowsAnyLocalHost(process.env),
    { bytes: 0, message: "No upload body is expected." },
  );
  if (refused) return refused;
  const access = await getSupportAccess();
  if (!access)
    return refuseUpload(401, "Sign in to remove a support screenshot.");
  const id = new URL(request.url).searchParams.get("attachmentId") ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return refuseUpload(404, "That staged screenshot is unavailable.");
  return deleteStagedSupportUpload(
    {
      find: (userId, attachmentId) =>
        getStagedSupportAttachment(getAppDb(), userId, attachmentId),
      markDeleting: (userId, attachmentId) =>
        markSupportAttachmentDeleted(getAppDb(), userId, attachmentId),
      purge: (rows) =>
        purgeSupportAttachments(
          {
            storage: getSupportStorage(),
            markPurged: (attachmentId) =>
              markSupportAttachmentPurged(getStaffDb(), attachmentId),
            onError: (attachmentId, error) =>
              console.error(
                "Could not remove private support screenshot; retained for retry",
                { attachmentId, error },
              ),
          },
          rows,
        ),
    },
    access.user.id,
    id,
  );
}
