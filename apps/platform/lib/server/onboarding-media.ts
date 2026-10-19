import "server-only";
import {
  consumeRateLimit,
  findOpenProject,
  newMediaAssetId,
  OnboardingLockedError,
  PhotoLimitReachedError,
  recordUploadedMedia,
  softDeleteMediaAsset,
  withTenantScope,
  type Database,
  type MediaAsset,
  type MediaAssetPurpose,
  type RateLimitRule,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { MAX_PHOTOS } from "@/lib/onboarding/brand-form";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import { isOnboardingLocked } from "@/lib/onboarding/snapshot";
import { deleteMediaFiles, mediaStorageKey, type MediaStorage } from "@brandbasket/shared/server/media-storage";
import { processUpload, UploadRejectedError, type ProcessedUpload, type UploadRejection } from "./media-upload";

/** Uploads a business may make in an hour, whatever happens to them afterwards. */
export const MEDIA_UPLOAD_RATE_LIMIT: RateLimitRule = { limit: 60, windowSeconds: 60 * 60 };

export const PHOTO_LIMIT_MESSAGE = `You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`;

export type MediaActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface OnboardingMediaDeps {
  readonly appDb: Database;
  readonly storage: MediaStorage;
}

/** What the browser is told about a stored upload. The storage key and checksum stay on the server. */
export interface UploadedAsset {
  readonly id: string;
  readonly purpose: MediaAssetPurpose;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
  readonly originalFilename: string;
}

/** Why an upload was not stored, as the HTTP status the route should answer with. */
export type UploadRefusal = "locked" | "photo-limit" | UploadRejection;

export type UploadOutcome =
  | { readonly ok: true; readonly asset: UploadedAsset }
  | {
      readonly ok: false;
      readonly refusal: UploadRefusal;
      readonly message: string;
      /** Set when the same upload may succeed later; the route sends it as Retry-After. */
      readonly retryAfterSeconds?: number;
    };

export type UploadAllowance =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number; readonly message: string };

export interface ReceivedUpload {
  readonly bytes: Uint8Array;
  /** Already cleaned by parseUploadFileName. */
  readonly filename: string;
}

/** How long to wait, in words: "1 minute", "5 minutes". */
export function retryMinutes(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function uploadedAsset(asset: MediaAsset): UploadedAsset {
  return {
    id: asset.id,
    purpose: asset.purpose,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    originalFilename: asset.originalFilename,
  };
}

/**
 * Whether the business can still add images: one indexed read, done before an upload's body is read or its rate
 * limit spent. The insert checks again under a lock, so this is only an early answer, never the gate.
 */
export async function isOnboardingOpen(appDb: Database, tenant: TenantContext): Promise<boolean> {
  const project = await withTenantScope(appDb, tenant, findOpenProject);
  return !isOnboardingLocked(project);
}

/** Spends one of the business's hourly uploads. Every upload attempt that gets this far counts. */
export async function consumeUploadAllowance(appDb: Database, tenant: TenantContext): Promise<UploadAllowance> {
  const limit = await consumeRateLimit(appDb, `media-upload:business:${tenant.businessId}`, MEDIA_UPLOAD_RATE_LIMIT);
  if (limit.allowed) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: limit.retryAfterSeconds,
    message: `You've uploaded a lot of images in the last hour. Try again in ${retryMinutes(limit.retryAfterSeconds)}.`,
  };
}

/**
 * One logo or photo, after the route's checks: check and re-encode, then store and record. The file is written
 * first under a fresh id and the row inserted after it; if the insert fails for any reason the file is deleted
 * again, so a row never points at a missing file and a file never outlives a failed upload. A new logo replaces the
 * old one in the same transaction, and the old file is removed once that has committed.
 */
export async function storeOnboardingImage(
  deps: OnboardingMediaDeps,
  tenant: TenantContext,
  purpose: MediaAssetPurpose,
  upload: ReceivedUpload,
): Promise<UploadOutcome> {
  let processed: ProcessedUpload;
  try {
    processed = await processUpload(upload.bytes);
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      const refusal = { ok: false, refusal: error.reason, message: error.message } as const;
      return error.retryAfterSeconds === null ? refusal : { ...refusal, retryAfterSeconds: error.retryAfterSeconds };
    }
    throw error;
  }

  const mediaId = newMediaAssetId();
  const storageKey = mediaStorageKey(tenant.businessId, mediaId, "display");
  await deps.storage.put(storageKey, processed.bytes, processed.mimeType);

  let recorded: Awaited<ReturnType<typeof recordUploadedMedia>>;
  try {
    recorded = await withTenantScope(deps.appDb, tenant, (tx) =>
      recordUploadedMedia(
        tx,
        {
          id: mediaId,
          purpose,
          storageKey,
          originalFilename: upload.filename,
          mimeType: processed.mimeType,
          bytes: processed.byteLength,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          altText: null,
          uploadedByUserId: tenant.userId,
        },
        { maxPhotos: MAX_PHOTOS },
      ),
    );
  } catch (error) {
    await deleteMediaFiles(deps.storage, [storageKey]);
    if (error instanceof OnboardingLockedError) {
      return { ok: false, refusal: "locked", message: ONBOARDING_LOCKED_MESSAGE };
    }
    if (error instanceof PhotoLimitReachedError) {
      return { ok: false, refusal: "photo-limit", message: PHOTO_LIMIT_MESSAGE };
    }
    throw error;
  }

  await deleteMediaFiles(deps.storage, recorded.replacedStorageKeys);
  return { ok: true, asset: uploadedAsset(recorded.asset) };
}

/** Removes one of the business's images: the row is soft-deleted, then the file is deleted after that commits. */
export async function removeOnboardingImage(
  deps: OnboardingMediaDeps,
  tenant: TenantContext,
  mediaId: string,
): Promise<MediaActionResult> {
  let storageKey: string | null;
  try {
    storageKey = await withTenantScope(deps.appDb, tenant, (tx) => softDeleteMediaAsset(tx, mediaId));
  } catch (error) {
    if (error instanceof OnboardingLockedError) return { ok: false, message: ONBOARDING_LOCKED_MESSAGE };
    throw error;
  }
  if (storageKey === null) {
    return { ok: false, message: "That image has already been removed. Reload the page to see the latest." };
  }

  await deleteMediaFiles(deps.storage, [storageKey]);
  return { ok: true };
}
