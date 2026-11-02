import { isUploadPurpose, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE, UPLOAD_FILE_NAME_HEADER } from "@brandbasket/shared/lib/uploads/limits";
import { parseUploadFileName } from "@brandbasket/shared/lib/uploads/file-name";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { hasDecodeCapacity, UPLOAD_REJECTION_STATUS, BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS } from "@brandbasket/shared/server/media-upload";
import { BodyTooLargeError, readLimitedBody } from "@brandbasket/shared/server/read-limited-body";
import { z } from "zod";
import { recordStaffAction } from "@/lib/server/activity";
import { storeClientBrandImage } from "@/lib/server/client-brand-images";
import { getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { getStaffAccess } from "@/lib/server/staff-access";

export const runtime = "nodejs";

const CONTENT_LENGTH = /^\d{1,15}$/;
const RELOAD_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";
const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again, then try the upload.";

function refuse(status: number, error: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * `POST /api/client-brand-assets?businessId=<id>&purpose=logo|photo`: one logo or photo staff add to a client, sent as the raw
 * image bytes. A route handler, not a server action, so the image's size limit applies here alone. Route handlers get no
 * origin check from Next, so the Origin must be the console's own, which is the CSRF guard. Checks without the database come
 * first, then the staff session, then the body is read with a byte counter that stops at the limit whatever Content-Length said.
 */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== new URL(serverEnv().ADMIN_ORIGIN).origin) {
    return refuse(403, "That upload didn't come from the console. Reload the page and try again.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength === null) return refuse(411, RELOAD_MESSAGE);
  if (!CONTENT_LENGTH.test(declaredLength)) return refuse(400, RELOAD_MESSAGE);
  if (Number(declaredLength) > MAX_UPLOAD_BYTES) return refuse(413, TOO_LARGE_MESSAGE);

  const params = new URL(request.url).searchParams;
  const businessId = params.get("businessId");
  const purpose = params.get("purpose");
  if (businessId === null || !z.uuid().safeParse(businessId).success || !isUploadPurpose(purpose)) return refuse(400, RELOAD_MESSAGE);

  const access = await getStaffAccess();
  if (access.kind !== "granted") return refuse(401, SIGNED_OUT_MESSAGE);

  if (!hasDecodeCapacity()) return refuse(UPLOAD_REJECTION_STATUS.busy, BUSY_MESSAGE, { "Retry-After": String(BUSY_RETRY_AFTER_SECONDS) });

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request.body, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return refuse(413, TOO_LARGE_MESSAGE);
    throw error;
  }

  const outcome = await storeClientBrandImage(
    { db: getStaffDb(), storage: getMediaStorage() },
    { businessId, staffUserId: access.user.id, purpose, filename: parseUploadFileName(request.headers.get(UPLOAD_FILE_NAME_HEADER)), bytes },
  );
  if (!outcome.ok) {
    return refuse(outcome.status, outcome.message, outcome.retryAfterSeconds === undefined ? {} : { "Retry-After": String(outcome.retryAfterSeconds) });
  }

  await recordStaffAction(access, {
    businessId,
    kind: "media.uploaded",
    summary: purpose === "logo" ? "Added their logo" : "Added a photo",
    data: { purpose, mediaId: outcome.mediaId },
  });
  return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
