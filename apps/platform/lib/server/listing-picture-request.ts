import "server-only";
import type { DirectoryPictureSlot } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { parsePictureSlot } from "@brandbasket/shared/lib/directory/pictures";
import { NO_LISTING_MESSAGE } from "@/lib/photos-view";
import type { ListingPictureOutcome, ListingPictureRefusal, UploadedPicture } from "./listing-pictures";
import type { UploadAllowance } from "./onboarding-media";
import {
  readUploadBody,
  refuseUpload,
  refuseUploadEnvelope,
  UPLOAD_REJECTION_STATUS,
  UPLOAD_RELOAD_MESSAGE,
  UPLOAD_SIGNED_OUT_MESSAGE,
  type DecodeBusy,
} from "./upload-request";

/**
 * `POST /api/listing-pictures?slot=listing|ad_tall|ad_wide`: one picture for one slot of a free listing account, sent
 * as the raw image bytes the crop window made. The same order of checks as the onboarding upload route
 * (handleUploadRequest), whose first three it shares:
 *
 * Without the database:
 * 1-3. the Host, the Origin and the declared length (refuseUploadEnvelope)
 * 4. `?slot=`, or 400
 *
 * With the database:
 * 5. a customer session with a business, or 401
 * 6. a listing to show the picture on (a claim that is not rejected), or 409
 * 7. room to decode the image now, or 503 with Retry-After, checked before the budget so a busy server does not
 *    cost the customer an upload
 * 8. the business's hourly upload budget, or 429 with Retry-After
 *
 * Then:
 * 9. the body within the limit, or 413
 * 10. the upload itself: 201 with the stored picture, or its refusal
 */
export interface ListingPictureRequestDeps {
  /** The signed-in customer's business, or null. Reads the session and membership only. */
  readonly getTenant: () => Promise<TenantContext | null>;
  /** Exactly as the browser sends it in Origin: scheme, host and port. */
  readonly appOrigin: string;
  /** Local development only: also take an upload from the dashboard opened on any local address (lib/surfaces.ts). */
  readonly anyLocalHost?: boolean;
  readonly canAddPictures: (tenant: TenantContext) => Promise<boolean>;
  /** Null when an image could be decoded now; otherwise the busy refusal to send, before any budget is spent. */
  readonly decodeBusy: () => DecodeBusy | null;
  readonly consumeAllowance: (tenant: TenantContext) => Promise<UploadAllowance>;
  readonly store: (tenant: TenantContext, slot: DirectoryPictureSlot, bytes: Uint8Array) => Promise<ListingPictureOutcome>;
}

export type ListingPictureResponseBody = { readonly picture: UploadedPicture } | { readonly error: string };

const REFUSAL_STATUS: Readonly<Record<ListingPictureRefusal, number>> = { ...UPLOAD_REJECTION_STATUS, "no-claim": 409 };

export async function handleListingPictureRequest(request: Request, deps: ListingPictureRequestDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const slot = parsePictureSlot(new URL(request.url).searchParams.get("slot"));
  if (slot === null) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);

  if (!(await deps.canAddPictures(tenant))) return refuseUpload(REFUSAL_STATUS["no-claim"], NO_LISTING_MESSAGE);

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

  const outcome = await deps.store(tenant, slot, bytes);
  if (!outcome.ok) {
    const retryHeaders: Record<string, string> =
      outcome.retryAfterSeconds === undefined ? {} : { "Retry-After": String(outcome.retryAfterSeconds) };
    return refuseUpload(REFUSAL_STATUS[outcome.refusal], outcome.message, retryHeaders);
  }
  const body: ListingPictureResponseBody = { picture: outcome.picture };
  return Response.json(body, { status: 201, headers: { "Cache-Control": "no-store" } });
}
