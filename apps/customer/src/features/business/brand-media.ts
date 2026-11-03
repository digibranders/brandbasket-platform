import "server-only";
import { removeBrandAsset, withTenantScope, type Database, type MediaAsset } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { deleteMediaFiles, type MediaStorage } from "@brandbasket/shared/server/media-storage";
import { IMAGE_GONE_MESSAGE } from "./rules";

/** One stored image as the Business page shows it. */
export interface BrandImage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
  readonly originalFilename: string;
}

export function brandImageOf(asset: MediaAsset): BrandImage {
  return { id: asset.id, width: asset.width, height: asset.height, altText: asset.altText, originalFilename: asset.originalFilename };
}

export type RemoveImageResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Removes one of the business's logo or photos, ported from apps/platform lib/server/onboarding-media.ts (removeBrandImage):
 * the row is soft-deleted under the brand-assets lock, then the file is deleted once that has committed. An unknown id,
 * another business's id or one already removed says so instead of succeeding. Uploads are not here: they go to the old app's
 * /api/brand-assets route.
 */
export async function removeBrandImage(deps: { readonly appDb: Database; readonly storage: MediaStorage }, tenant: TenantContext, mediaId: string): Promise<RemoveImageResult> {
  const storageKey = await withTenantScope(deps.appDb, tenant, (tx) => removeBrandAsset(tx, mediaId));
  if (storageKey === null) return { ok: false, message: IMAGE_GONE_MESSAGE };
  await deleteMediaFiles(deps.storage, [storageKey]);
  return { ok: true };
}
