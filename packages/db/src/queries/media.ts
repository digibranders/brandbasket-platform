import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { ScopedTransaction } from "../scope";
import { mediaAssets, type MediaAssetPurpose, type MediaAssetStatus } from "../schema";
import { lockOnboardingProject, lockOnboardingProjectExclusively } from "./onboarding-data";
import { currentBusinessId, isUuid } from "./tenant";

/*
 * Customer-side media rows. Like the onboarding saves, every function takes the withTenantScope transaction on the
 * app connection, and every write is refused once the project has left onboarding: the only uploads in this phase
 * are the onboarding logo and photos.
 */

export class PhotoLimitReachedError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`A business may keep at most ${limit} photos.`);
    this.name = "PhotoLimitReachedError";
    this.limit = limit;
  }
}

/** The storage key is built from the id, so the id exists before the row does. */
export function newMediaAssetId(): string {
  return uuidv7();
}

export interface MediaAsset {
  readonly id: string;
  readonly businessId: string;
  readonly purpose: MediaAssetPurpose;
  readonly storageKey: string;
  /** For the customer's own reference only. Never put it in a storage key, a URL or a header. */
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly altText: string | null;
  readonly status: MediaAssetStatus;
  readonly uploadedByUserId: string;
  readonly createdAt: Date;
}

const MEDIA_COLUMNS = {
  id: mediaAssets.id,
  businessId: mediaAssets.businessId,
  purpose: mediaAssets.purpose,
  storageKey: mediaAssets.storageKey,
  originalFilename: mediaAssets.originalFilename,
  mimeType: mediaAssets.mimeType,
  bytes: mediaAssets.bytes,
  width: mediaAssets.width,
  height: mediaAssets.height,
  sha256: mediaAssets.sha256,
  altText: mediaAssets.altText,
  status: mediaAssets.status,
  uploadedByUserId: mediaAssets.uploadedByUserId,
  createdAt: mediaAssets.createdAt,
} as const;

export interface NewMediaAsset {
  /** From newMediaAssetId(); the same id the storage key was built from. */
  readonly id: string;
  readonly purpose: MediaAssetPurpose;
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly altText: string | null;
  readonly uploadedByUserId: string;
}

/** Records a processed upload as `ready` for the scoped business. */
export async function insertMediaAsset(tx: ScopedTransaction, input: NewMediaAsset): Promise<MediaAsset> {
  if (!isUuid(input.id)) throw new Error(`Media asset id must be a UUID, received "${input.id}"`);
  const { businessId } = await lockOnboardingProject(tx);
  const rows = await tx
    .insert(mediaAssets)
    .values({
      id: input.id,
      businessId,
      purpose: input.purpose,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      sha256: input.sha256,
      altText: input.altText,
      status: "ready",
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning(MEDIA_COLUMNS);
  const asset = rows[0];
  if (asset === undefined) throw new Error("Media asset insert returned no row");
  return asset;
}

/**
 * A ready, not-deleted asset of the scoped business, or null. Another tenant's id is simply not found, and so is
 * anything that is not a UUID.
 */
export async function findMediaAsset(tx: ScopedTransaction, mediaId: string): Promise<MediaAsset | null> {
  if (!isUuid(mediaId)) return null;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(MEDIA_COLUMNS)
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, mediaId),
        eq(mediaAssets.businessId, businessId),
        eq(mediaAssets.status, "ready"),
        isNull(mediaAssets.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** The scoped business's ready assets for one purpose, oldest first. */
export async function listMediaAssets(tx: ScopedTransaction, purpose: MediaAssetPurpose): Promise<MediaAsset[]> {
  const businessId = await currentBusinessId(tx);
  return tx
    .select(MEDIA_COLUMNS)
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.businessId, businessId),
        eq(mediaAssets.purpose, purpose),
        eq(mediaAssets.status, "ready"),
        isNull(mediaAssets.deletedAt),
      ),
    )
    .orderBy(asc(mediaAssets.createdAt), asc(mediaAssets.id));
}

/** Sets the description read out to people who cannot see the image. Returns false when no such asset exists. */
export async function updateMediaAltText(
  tx: ScopedTransaction,
  mediaId: string,
  altText: string | null,
): Promise<boolean> {
  const { businessId } = await lockOnboardingProject(tx);
  if (!isUuid(mediaId)) return false;
  const rows = await tx
    .update(mediaAssets)
    .set({ altText })
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.businessId, businessId), isNull(mediaAssets.deletedAt)))
    .returning({ id: mediaAssets.id });
  return rows.length > 0;
}

/**
 * Soft-deletes an asset and returns its storage key so the caller can remove the file after the transaction
 * commits, or null when no such asset exists. The row is kept for the record.
 */
export async function softDeleteMediaAsset(tx: ScopedTransaction, mediaId: string): Promise<string | null> {
  const { businessId } = await lockOnboardingProject(tx);
  if (!isUuid(mediaId)) return null;
  const rows = await tx
    .update(mediaAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.businessId, businessId), isNull(mediaAssets.deletedAt)))
    .returning({ storageKey: mediaAssets.storageKey });
  return rows[0]?.storageKey ?? null;
}

export interface UploadLimits {
  /** The most photos a business may keep at once. */
  readonly maxPhotos: number;
}

export interface RecordedUpload {
  readonly asset: MediaAsset;
  /** Files of the logos this one replaced, to delete once the transaction has committed. */
  readonly replacedStorageKeys: readonly string[];
}

/**
 * Records a stored upload: a photo is refused with PhotoLimitReachedError once the business has `maxPhotos`, and a
 * logo soft-deletes the logos before it. The project row is locked FOR UPDATE first, so two uploads for one business
 * run one after the other: the second counts the first's photo, and two new logos never both survive.
 */
export async function recordUploadedMedia(
  tx: ScopedTransaction,
  input: NewMediaAsset,
  limits: UploadLimits,
): Promise<RecordedUpload> {
  await lockOnboardingProjectExclusively(tx);
  const existing = await listMediaAssets(tx, input.purpose);
  if (input.purpose === "photo" && existing.length >= limits.maxPhotos) {
    throw new PhotoLimitReachedError(limits.maxPhotos);
  }

  const asset = await insertMediaAsset(tx, input);
  if (input.purpose !== "logo") return { asset, replacedStorageKeys: [] };

  const replacedStorageKeys: string[] = [];
  for (const previous of existing) {
    const key = await softDeleteMediaAsset(tx, previous.id);
    if (key !== null) replacedStorageKeys.push(key);
  }
  return { asset, replacedStorageKeys };
}

// ---------------------------------------------------------------------------------------------------------------
// Brand assets after the website is built
// ---------------------------------------------------------------------------------------------------------------

/**
 * Takes a lock that lasts until the transaction ends and is shared by every brand asset change of one business, so two
 * uploads run one after the other: the second counts the first's photo, and two new logos never both survive. The project
 * row is not used because, once the website is built, there is no project in onboarding to lock.
 */
async function lockBrandAssets(tx: ScopedTransaction): Promise<string> {
  const businessId = await currentBusinessId(tx);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`brand-assets:${businessId}`}, 0))`);
  return businessId;
}

/**
 * recordUploadedMedia for a business whose website is already built: the same rules (a photo is refused with
 * PhotoLimitReachedError at `maxPhotos`, a new logo replaces the old one), without the onboarding lock, so it works on any
 * plan at any time. Like the onboarding version it is for the scoped business only.
 */
export async function recordBrandAsset(tx: ScopedTransaction, input: NewMediaAsset, limits: UploadLimits): Promise<RecordedUpload> {
  if (!isUuid(input.id)) throw new Error(`Media asset id must be a UUID, received "${input.id}"`);
  const businessId = await lockBrandAssets(tx);
  const existing = await listMediaAssets(tx, input.purpose);
  if (input.purpose === "photo" && existing.length >= limits.maxPhotos) throw new PhotoLimitReachedError(limits.maxPhotos);

  const rows = await tx
    .insert(mediaAssets)
    .values({
      id: input.id,
      businessId,
      purpose: input.purpose,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      sha256: input.sha256,
      altText: input.altText,
      status: "ready",
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning(MEDIA_COLUMNS);
  const asset = rows[0];
  if (asset === undefined) throw new Error("Media asset insert returned no row");
  if (input.purpose !== "logo") return { asset, replacedStorageKeys: [] };

  const replacedStorageKeys: string[] = [];
  for (const previous of existing) {
    const key = await removeBrandAsset(tx, previous.id);
    if (key !== null) replacedStorageKeys.push(key);
  }
  return { asset, replacedStorageKeys };
}

/** softDeleteMediaAsset without the onboarding lock: returns the storage key to delete once the transaction commits, or null when there is no such asset. */
export async function removeBrandAsset(tx: ScopedTransaction, mediaId: string): Promise<string | null> {
  const businessId = await lockBrandAssets(tx);
  if (!isUuid(mediaId)) return null;
  const rows = await tx
    .update(mediaAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.businessId, businessId), isNull(mediaAssets.deletedAt)))
    .returning({ storageKey: mediaAssets.storageKey });
  return rows[0]?.storageKey ?? null;
}
