import "server-only";
import type { TenantContext } from "@fynix/shared/lib/access";
import {
  parseVideoSlot,
  VIDEO_MAX_UPLOAD_BYTES,
  VIDEO_PREMIUM_MESSAGE,
  VIDEO_TOO_LARGE_MESSAGE,
  type VideoSlot,
} from "@fynix/shared/lib/directory/videos";
import type { VideoAccess } from "@/lib/videos-view";
import type { VideoProgress, VideoUploadOutcome, VideoUploadRefusal } from "./listing-videos";
import type { UploadAllowance } from "./onboarding-media";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import { refuseUpload, refuseUploadEnvelope, UPLOAD_RELOAD_MESSAGE, UPLOAD_SIGNED_OUT_MESSAGE } from "./upload-request";

/**
 * The two routes a Premium member's video upload goes through (docs/superpowers/specs/2026-10-07-business-videos-
 * design.md). The video file itself never touches them: the browser sends it to Vimeo with the address the first returns.
 *
 * `POST /api/listing-videos` with `{ slot, size }`: asks for an upload. The checks, in order:
 *
 * Without the database:
 * 1-3. the Host, the Origin and a declared length (refuseUploadEnvelope: the same guard every upload route has)
 * 4. a JSON body of `{ slot: 1|2|3, size: whole bytes }` within 50 MB, or 400 / 413
 *
 * With the database:
 * 5. a customer session with a business, or 401
 * 6. a Premium member (403 with the Premium message) with a listing to show the video on (409)
 * 7. the business's hourly budget, or 429 with Retry-After
 * 8. the upload itself: 201 with the new video and where to send it, or its refusal
 *
 * `POST /api/listing-videos/<id>/finish`: asks where an upload stands, over and over, until it is live (200), has been
 * given up with a reason the owner is told (422), or is not waiting any more (404). A Vimeo outage is 502: ask again.
 */

export const NO_LISTING_FOR_VIDEO_MESSAGE = "Add your listing first, then your videos can show on its page.";
const VIMEO_DOWN_MESSAGE = "We couldn't reach our video service. Trying again…";
const NOT_FOUND_MESSAGE = "That upload isn't waiting any more.";

/** `{ slot, size }` is a few dozen bytes. */
const MAX_BODY_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface VideoRequestDeps {
  /** The signed-in customer's business, or null. Reads the session and membership only. */
  readonly getTenant: () => Promise<TenantContext | null>;
  /** Exactly as the browser sends it in Origin: scheme, host and port. */
  readonly appOrigin: string;
  /** Local development only: also take a request from the dashboard opened on any local address (lib/surfaces.ts). */
  readonly anyLocalHost?: boolean;
  readonly videoAccess: (tenant: TenantContext) => Promise<VideoAccess>;
  readonly consumeAllowance: (tenant: TenantContext) => Promise<UploadAllowance>;
  readonly requestUpload: (tenant: TenantContext, slot: VideoSlot, size: number) => Promise<VideoUploadOutcome>;
  readonly checkProgress: (tenant: TenantContext, videoId: string) => Promise<VideoProgress>;
  /** Records a failure to reach Vimeo, for us to read. */
  readonly log: (message: string, error: unknown) => void;
}

const REFUSAL_STATUS: Readonly<Record<VideoUploadRefusal, number>> = {
  "not-member": 403,
  "no-claim": 409,
  unavailable: 503,
  quota: 503,
  failed: 502,
};

interface UploadAsk {
  readonly slot: VideoSlot;
  readonly size: number;
}

/** The body, or the answer to refuse it with. */
async function readAsk(request: Request): Promise<UploadAsk | Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
  let text: string;
  try {
    text = new TextDecoder().decode(await readLimitedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
  const { slot: rawSlot, size } = parsed as { slot?: unknown; size?: unknown };
  const slot = parseVideoSlot(rawSlot);
  if (slot === null || typeof size !== "number" || !Number.isInteger(size) || size <= 0) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);
  if (size > VIDEO_MAX_UPLOAD_BYTES) return refuseUpload(413, VIDEO_TOO_LARGE_MESSAGE);
  return { slot, size };
}

export async function handleVideoUploadRequest(request: Request, deps: VideoRequestDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const ask = await readAsk(request);
  if (ask instanceof Response) return ask;

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);

  const access = await deps.videoAccess(tenant);
  if (access === "not-member") return refuseUpload(REFUSAL_STATUS["not-member"], VIDEO_PREMIUM_MESSAGE);
  if (access === "no-listing") return refuseUpload(REFUSAL_STATUS["no-claim"], NO_LISTING_FOR_VIDEO_MESSAGE);

  const allowance = await deps.consumeAllowance(tenant);
  if (!allowance.allowed) {
    return refuseUpload(429, allowance.message, { "Retry-After": String(allowance.retryAfterSeconds) });
  }

  const outcome = await deps.requestUpload(tenant, ask.slot, ask.size);
  if (!outcome.ok) return refuseUpload(REFUSAL_STATUS[outcome.refusal], outcome.message);
  return Response.json({ video: outcome.video, uploadLink: outcome.uploadLink }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function handleVideoFinishRequest(request: Request, deps: VideoRequestDeps, videoId: string): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;
  if (!UUID.test(videoId)) return refuseUpload(404, NOT_FOUND_MESSAGE);

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);

  let progress: VideoProgress;
  try {
    progress = await deps.checkProgress(tenant, videoId);
  } catch (error) {
    deps.log("Could not check a video's progress.", error);
    return refuseUpload(502, VIMEO_DOWN_MESSAGE);
  }
  if (progress.state === "failed") return refuseUpload(422, progress.message);
  if (progress.state === "gone") return refuseUpload(404, NOT_FOUND_MESSAGE);
  return Response.json(progress, { status: 200, headers: { "Cache-Control": "no-store" } });
}
