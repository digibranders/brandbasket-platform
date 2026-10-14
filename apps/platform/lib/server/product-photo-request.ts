import "server-only";
import type { TenantContext } from "@fynix/shared/lib/access";
import { NO_LISTING_MESSAGE } from "@/lib/photos-view";
import type { UploadAllowance } from "./onboarding-media";
import type { ProductPhotoOutcome, ProductPhotoRefusal } from "./product-photos";
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
 * `POST /api/product-photos?product=<product id>`: one photo for one product of an owner-added business, sent as the raw
 * image bytes. The same order of checks as the listing picture route (handleListingPictureRequest):
 *
 * Without the database:
 * 1-3. the Host, the Origin and the declared length (refuseUploadEnvelope)
 * 4. `?product=` is a product id, or 400
 *
 * With the database:
 * 5. a customer session with a business, or 401
 * 6. a listing for the product to show on (and a plan that has pictures), or 409
 * 7. room to decode the image now, or 503 with Retry-After
 * 8. the business's hourly upload budget, or 429 with Retry-After
 *
 * Then:
 * 9. the body within the limit, or 413
 * 10. the upload itself: 201 with the new photo's id, or its refusal
 */
export interface ProductPhotoRequestDeps {
  /** The signed-in customer's business, or null. Reads the session and membership only. */
  readonly getTenant: () => Promise<TenantContext | null>;
  /** Exactly as the browser sends it in Origin: scheme, host and port. */
  readonly appOrigin: string;
  /** Local development only: also take an upload from the dashboard opened on any local address (lib/surfaces.ts). */
  readonly anyLocalHost?: boolean;
  readonly canAddPhotos: (tenant: TenantContext) => Promise<boolean>;
  /** Null when an image could be decoded now; otherwise the busy refusal to send, before any budget is spent. */
  readonly decodeBusy: () => DecodeBusy | null;
  readonly consumeAllowance: (tenant: TenantContext) => Promise<UploadAllowance>;
  readonly store: (tenant: TenantContext, productId: string, bytes: Uint8Array) => Promise<ProductPhotoOutcome>;
}

export type ProductPhotoResponseBody = { readonly photoId: string } | { readonly error: string };

const REFUSAL_STATUS: Readonly<Record<ProductPhotoRefusal, number>> = { ...UPLOAD_REJECTION_STATUS, "not-found": 404 };
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function handleProductPhotoRequest(request: Request, deps: ProductPhotoRequestDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const productId = new URL(request.url).searchParams.get("product");
  if (productId === null || !PRODUCT_ID_PATTERN.test(productId)) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);

  if (!(await deps.canAddPhotos(tenant))) return refuseUpload(409, NO_LISTING_MESSAGE);

  const busy = deps.decodeBusy();
  if (busy !== null) {
    return refuseUpload(UPLOAD_REJECTION_STATUS.busy, busy.message, { "Retry-After": String(busy.retryAfterSeconds) });
  }

  const allowance = await deps.consumeAllowance(tenant);
  if (!allowance.allowed) {
    return refuseUpload(429, allowance.message, { "Retry-After": String(allowance.retryAfterSeconds) });
  }

  const bytes = await readUploadBody(request);
  if (bytes instanceof Response) return bytes;

  const outcome = await deps.store(tenant, productId, bytes);
  if (!outcome.ok) {
    const retryHeaders: Record<string, string> =
      outcome.retryAfterSeconds === undefined ? {} : { "Retry-After": String(outcome.retryAfterSeconds) };
    return refuseUpload(REFUSAL_STATUS[outcome.refusal], outcome.message, retryHeaders);
  }
  const body: ProductPhotoResponseBody = { photoId: outcome.photoId };
  return Response.json(body, { status: 201, headers: { "Cache-Control": "no-store" } });
}
