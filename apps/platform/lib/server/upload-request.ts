import "server-only";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import { BRAND } from "@/lib/brand";
import { isAppOrigin, resolveSurface, type SurfaceOrigins } from "@/lib/surfaces";
import { parseUploadFileName } from "@/lib/uploads/file-name";
import {
  isUploadPurpose,
  MAX_UPLOAD_BYTES,
  TOO_LARGE_MESSAGE,
  UPLOAD_FILE_NAME_HEADER,
  type UploadPurpose,
} from "@/lib/uploads/limits";
import type { UploadRejection } from "./media-upload";
import type { ReceivedUpload, UploadAllowance, UploadedAsset, UploadOutcome, UploadRefusal } from "./onboarding-media";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";

/**
 * `POST /api/uploads`: one logo or photo per request, sent as the raw image bytes. The checks that need no database
 * come first, then the ones that do, and the body is read last, with a byte counter that stops at the limit whatever
 * Content-Length claimed.
 *
 * Without the database:
 * 1. a Host equal to the app origin's, or 403 (the route sits under /api/, which the proxy skips, so nothing else
 *    keeps it off the marketing and admin hosts)
 * 2. an Origin header equal to the app origin, or 403 (route handlers get no server-action origin check, so this is
 *    the CSRF guard)
 * 3. a Content-Length header, or 411; a malformed one is 400, and one over the limit is 413
 * 4. `?purpose=logo|photo`, or 400
 *
 * With the database:
 * 5. a customer session with a business, or 401
 * 6. onboarding still open, or 409 with the locked message
 * 7. room to decode the image now, or 503 with Retry-After, checked before the budget so a busy server does not
 *    cost the customer an upload
 * 8. the business's hourly upload budget, or 429 with Retry-After
 *
 * Then:
 * 9. the body within the limit, or 413
 * 10. the upload itself: 201 with the stored asset, or its refusal (503 with Retry-After if the server became too
 *     busy to decode it after step 7)
 */
export interface UploadRequestDeps {
  /** The signed-in customer's business, or null. Reads the session and membership only. */
  readonly getTenant: () => Promise<TenantContext | null>;
  /** Exactly as the browser sends it in Origin: scheme, host and port. */
  readonly appOrigin: string;
  /** Local development only: also take an upload from the dashboard opened on any local address (lib/surfaces.ts). */
  readonly anyLocalHost?: boolean;
  readonly isOnboardingOpen: (tenant: TenantContext) => Promise<boolean>;
  /** Null when an image could be decoded now; otherwise the busy refusal to send, before any budget is spent. */
  readonly decodeBusy: () => DecodeBusy | null;
  readonly consumeAllowance: (tenant: TenantContext) => Promise<UploadAllowance>;
  readonly store: (tenant: TenantContext, purpose: UploadPurpose, upload: ReceivedUpload) => Promise<UploadOutcome>;
}

export interface DecodeBusy {
  readonly message: string;
  readonly retryAfterSeconds: number;
}

export type UploadResponseBody = { readonly asset: UploadedAsset } | { readonly error: string };

const CONTENT_LENGTH = /^\d{1,15}$/;

/** The status each reason an image is not stored answers with, shared by every image upload route. */
export const UPLOAD_REJECTION_STATUS: Readonly<Record<UploadRejection, number>> = {
  empty: 422,
  "too-large": 413,
  "unsupported-type": 415,
  unreadable: 422,
  busy: 503,
};

const REFUSAL_STATUS: Readonly<Record<UploadRefusal, number>> = {
  ...UPLOAD_REJECTION_STATUS,
  locked: 409,
  "photo-limit": 409,
};

export const UPLOAD_RELOAD_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";
export const UPLOAD_SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again, then try the upload.";

function json(status: number, body: UploadResponseBody, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** A refusal in the shape every image upload route answers with: `{ error }`, never cached. */
export function refuseUpload(status: number, error: string, headers: Record<string, string> = {}): Response {
  return json(status, { error }, headers);
}

/** The most bytes a route takes in one body, and what the owner is told when a body is over it. Images are 4 MB; a video is 50 MB. */
export interface UploadLimit {
  readonly bytes: number;
  readonly message: string;
}

const IMAGE_UPLOAD_LIMIT: UploadLimit = { bytes: MAX_UPLOAD_BYTES, message: TOO_LARGE_MESSAGE };

/**
 * Steps 1 to 3 above, which need no database and are the same for every image upload route on the app host: the
 * Host, the Origin and the declared length. Null when the request may go on.
 */
export function refuseUploadEnvelope(
  request: Request,
  appOrigin: string,
  anyLocalHost = false,
  limit: UploadLimit = IMAGE_UPLOAD_LIMIT,
): Response | null {
  const rawHost = request.headers.get("host");
  const origins: SurfaceOrigins = { app: appOrigin, anyLocalHost };
  if (resolveSurface(rawHost, origins) !== "app") {
    return refuseUpload(403, `Uploads only work from your ${BRAND.shortName} dashboard. Open it and try again.`);
  }

  if (!isAppOrigin(request.headers.get("origin"), rawHost, origins)) {
    return refuseUpload(403, "That upload didn't come from your dashboard. Reload the page and try again.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength === null) return refuseUpload(411, UPLOAD_RELOAD_MESSAGE);
  if (!CONTENT_LENGTH.test(declaredLength)) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
  if (Number(declaredLength) > limit.bytes) return refuseUpload(413, limit.message);
  return null;
}

/** Step 9: the body within the limit whatever Content-Length claimed, or the 413 to answer with. */
export async function readUploadBody(request: Request): Promise<Uint8Array | Response> {
  try {
    return await readLimitedBody(request.body, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return refuseUpload(413, TOO_LARGE_MESSAGE);
    throw error;
  }
}

export async function handleUploadRequest(request: Request, deps: UploadRequestDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const purpose = new URL(request.url).searchParams.get("purpose");
  if (!isUploadPurpose(purpose)) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);

  if (!(await deps.isOnboardingOpen(tenant))) return refuseUpload(409, ONBOARDING_LOCKED_MESSAGE);

  const busy = deps.decodeBusy();
  if (busy !== null) {
    return refuseUpload(REFUSAL_STATUS.busy, busy.message, { "Retry-After": String(busy.retryAfterSeconds) });
  }

  const allowance = await deps.consumeAllowance(tenant);
  if (!allowance.allowed) {
    return refuseUpload(429, allowance.message, { "Retry-After": String(allowance.retryAfterSeconds) });
  }

  const bytes = await readUploadBody(request);
  if (bytes instanceof Response) return bytes;

  const filename = parseUploadFileName(request.headers.get(UPLOAD_FILE_NAME_HEADER));
  const outcome = await deps.store(tenant, purpose, { bytes, filename });
  if (!outcome.ok) {
    const retryHeaders: Record<string, string> =
      outcome.retryAfterSeconds === undefined ? {} : { "Retry-After": String(outcome.retryAfterSeconds) };
    return refuseUpload(REFUSAL_STATUS[outcome.refusal], outcome.message, retryHeaders);
  }
  return json(201, { asset: outcome.asset });
}
