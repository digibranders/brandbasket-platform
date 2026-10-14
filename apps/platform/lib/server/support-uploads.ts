import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  supportStorageKey,
  type SupportStorage,
} from "@fynix/shared/server/support-storage";
import { detectImageType } from "./media-upload";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import { createSemaphore, SemaphoreFullError } from "./semaphore";
import { refuseUploadEnvelope, refuseUpload } from "./upload-request";

export const SUPPORT_FILE_LIMIT = 4 * 1024 * 1024;
export const SUPPORT_TOTAL_LIMIT = 3 * SUPPORT_FILE_LIMIT;
/** Multipart framing allowance is separate from the 12 MiB aggregate image limit. */
export const SUPPORT_BODY_LIMIT = SUPPORT_TOTAL_LIMIT + 64 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 3200;
const requestSlots = createSemaphore({ limit: 2, maxWaiting: 4 });
const decodeSlots = createSemaphore({ limit: 2, maxWaiting: 4 });
const TOO_LARGE = "Use up to 3 screenshots, 4 MiB each and 12 MiB in total.";
class SupportUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SupportUploadError";
  }
}
export interface ProcessedSupportImage {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/webp";
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}
/** Detect magic bytes, reject MIME spoofing/animation, and reencode without EXIF or other source metadata. */
export async function processSupportImage(
  bytes: Uint8Array,
  declaredType: string,
): Promise<ProcessedSupportImage> {
  if (bytes.byteLength === 0)
    throw new SupportUploadError(422, "That screenshot is empty.");
  if (bytes.byteLength > SUPPORT_FILE_LIMIT)
    throw new SupportUploadError(413, TOO_LARGE);
  const type = detectImageType(bytes.subarray(0, 12));
  if (type === null)
    throw new SupportUploadError(415, "Use a PNG, JPEG or WebP screenshot.");
  if (declaredType !== type)
    throw new SupportUploadError(
      415,
      "The screenshot's declared type does not match its contents.",
    );
  try {
    return await decodeSlots.run(async () => {
      const image = sharp(bytes, {
        limitInputPixels: MAX_PIXELS,
        sequentialRead: true,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      const expected = {
        "image/png": "png",
        "image/jpeg": "jpeg",
        "image/webp": "webp",
      }[type];
      if (
        metadata.format !== expected ||
        (metadata.pages ?? 1) !== 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MAX_PIXELS
      )
        throw new SupportUploadError(
          422,
          "Use a single image with at most 16 million pixels.",
        );
      const output = await image
        .rotate()
        .resize({
          width: MAX_SIDE,
          height: MAX_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      if (output.data.byteLength > SUPPORT_FILE_LIMIT)
        throw new SupportUploadError(413, TOO_LARGE);
      const normalized = new Uint8Array(output.data);
      return {
        bytes: normalized,
        mimeType: "image/webp",
        byteSize: normalized.byteLength,
        width: output.info.width,
        height: output.info.height,
        sha256: createHash("sha256").update(normalized).digest("hex"),
      };
    });
  } catch (error) {
    if (
      error instanceof SupportUploadError ||
      error instanceof SemaphoreFullError
    )
      throw error;
    throw new SupportUploadError(
      422,
      "We couldn't read that screenshot. Choose an undamaged PNG, JPEG or WebP image.",
    );
  }
}
export interface StagedSupportUpload {
  readonly id: string;
  readonly userId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: "image/webp";
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly expiresAt: Date;
}
export interface SupportUploadDeps {
  readonly withUploadLock: (
    userId: string,
    work: () => Promise<Response>,
  ) => Promise<Response>;
  readonly appOrigin: string;
  readonly anyLocalHost?: boolean;
  readonly getRequester: () => Promise<{ readonly id: string } | null>;
  readonly isClosing: (userId: string) => Promise<boolean>;
  readonly consumeAllowance: (userId: string) => Promise<{
    readonly allowed: boolean;
    readonly retryAfterSeconds: number;
  }>;
  readonly stage: (attachment: StagedSupportUpload) => Promise<void>;
  readonly confirm: (userId: string, id: string) => Promise<boolean>;
  readonly markDeleting: (userId: string, id: string) => Promise<void>;
  readonly storage: SupportStorage;
}
function safeFilename(filename: string): string {
  return (
    filename
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
      .slice(0, 120)
      .trim() || "screenshot"
  );
}
async function uploadBody(
  request: Request,
  deps: SupportUploadDeps,
  userId: string,
): Promise<Response> {
  const bytes = await readLimitedBody(request.body, SUPPORT_BODY_LIMIT);
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: new Uint8Array(bytes),
    }).formData();
  } catch {
    return refuseUpload(400, "Choose screenshots and try the upload again.");
  }
  const values = form.getAll("files");
  if (
    [...form.keys()].some((key) => key !== "files") ||
    values.length < 1 ||
    values.length > 3 ||
    values.some((file) => !(file instanceof File))
  )
    return refuseUpload(400, TOO_LARGE);
  const files = values as File[];
  if (
    files.some((file) => file.size > SUPPORT_FILE_LIMIT) ||
    files.reduce((sum, file) => sum + file.size, 0) > SUPPORT_TOTAL_LIMIT
  )
    return refuseUpload(413, TOO_LARGE);
  // Count each screenshot against the durable user budget, including failed attempts.
  for (let remaining = files.length - 1; remaining > 0; remaining--) {
    const allowance = await deps.consumeAllowance(userId);
    if (!allowance.allowed)
      return refuseUpload(
        429,
        "You've reached the screenshot upload limit. Try again in an hour.",
        { "Retry-After": String(allowance.retryAfterSeconds) },
      );
  }
  const processed: { file: File; image: ProcessedSupportImage }[] = [];
  for (const file of files)
    processed.push({
      file,
      image: await processSupportImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      ),
    });
  const staged: StagedSupportUpload[] = [];
  try {
    for (const { file, image } of processed) {
      const id = randomUUID();
      const attachment: StagedSupportUpload = {
        id,
        userId,
        storageKey: supportStorageKey(randomUUID(), id),
        filename: safeFilename(file.name),
        mimeType: image.mimeType,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      await deps.stage(attachment);
      staged.push(attachment);
      await deps.storage.put(attachment.storageKey, image.bytes);
      if (!(await deps.confirm(userId, id)))
        throw new SupportUploadError(
          409,
          "The screenshot upload was withdrawn. Restore your account or try again.",
        );
    }
  } catch (error) {
    // Rows are retained until the maintenance worker has successfully deleted each object.
    for (const attachment of staged) {
      try {
        await deps.markDeleting(userId, attachment.id);
        await deps.storage.delete(attachment.storageKey);
      } catch (cleanupError) {
        console.error("Could not mark failed support upload for deletion", {
          attachmentId: attachment.id,
          error: cleanupError,
        });
      }
    }
    if (error instanceof SupportUploadError)
      return refuseUpload(error.status, error.message);
    console.error("Could not store private support screenshot", { error });
    return refuseUpload(
      503,
      "Screenshot storage is temporarily unavailable. Please try again.",
    );
  }
  return Response.json(
    {
      attachments: staged.map(({ id, mimeType, byteSize, width, height }) => ({
        id,
        mimeType,
        byteSize,
        width,
        height,
      })),
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function handleSupportUploadRequest(
  request: Request,
  deps: SupportUploadDeps,
): Promise<Response> {
  const refused = refuseUploadEnvelope(
    request,
    deps.appOrigin,
    deps.anyLocalHost,
    { bytes: SUPPORT_BODY_LIMIT, message: TOO_LARGE },
  );
  if (refused) return refused;
  if (
    !/^multipart\/form-data;\s*boundary=/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    return refuseUpload(415, "Send screenshots as multipart form data.");
  const user = await deps.getRequester();
  if (!user)
    return refuseUpload(401, "Sign in to upload a support screenshot.");
  if (await deps.isClosing(user.id))
    return refuseUpload(
      409,
      "Restore your account before uploading screenshots.",
    );
  try {
    return await requestSlots.run(() =>
      deps.withUploadLock(user.id, async () => {
        if (await deps.isClosing(user.id))
          return refuseUpload(
            409,
            "Restore your account before uploading screenshots.",
          );
        const allowance = await deps.consumeAllowance(user.id);
        if (!allowance.allowed)
          return refuseUpload(
            429,
            "You've reached the screenshot upload limit. Try again in an hour.",
            { "Retry-After": String(allowance.retryAfterSeconds) },
          );
        return uploadBody(request, deps, user.id);
      }),
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError) return refuseUpload(413, TOO_LARGE);
    if (error instanceof SupportUploadError)
      return refuseUpload(error.status, error.message);
    if (error instanceof SemaphoreFullError)
      return refuseUpload(
        503,
        "We're handling several screenshots. Please try again shortly.",
        { "Retry-After": "10" },
      );
    console.error("Could not process support screenshot upload", { error });
    return refuseUpload(
      503,
      "Screenshot upload is temporarily unavailable. Please try again.",
    );
  }
}

/** Own staged uploads only; the conditional transition prevents removing a concurrently attached screenshot. */
export async function deleteStagedSupportUpload(
  deps: {
    readonly find: (
      userId: string,
      id: string,
    ) => Promise<{ id: string; storageKey: string } | null>;
    readonly markDeleting: (userId: string, id: string) => Promise<boolean>;
    readonly purge: (
      rows: readonly { id: string; storageKey: string }[],
    ) => Promise<{ purged: number; failed: number }>;
  },
  userId: string,
  attachmentId: string,
): Promise<Response> {
  const row = await deps.find(userId, attachmentId);
  if (!row || !(await deps.markDeleting(userId, attachmentId)))
    return refuseUpload(404, "That staged screenshot is unavailable.");
  const result = await deps.purge([row]);
  if (result.failed)
    return Response.json(
      { deletionPending: true },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
