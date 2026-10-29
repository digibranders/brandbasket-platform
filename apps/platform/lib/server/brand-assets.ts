import "server-only";
import { listMediaAssets, withTenantScope, type MediaAsset } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { getAppDb } from "./db";

/** One stored image as the Business page shows it. */
export interface BrandImage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
  readonly originalFilename: string;
}

export interface BrandAssets {
  readonly logo: BrandImage | null;
  readonly photos: readonly BrandImage[];
}

const imageOf = (asset: MediaAsset): BrandImage => ({ id: asset.id, width: asset.width, height: asset.height, altText: asset.altText, originalFilename: asset.originalFilename });

/** The business's logo and photos. Throws when they cannot be read: the page says so instead of showing an empty library that looks like having none. */
export async function loadBrandAssets(tenant: TenantContext): Promise<BrandAssets> {
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const [logos, photos] = await Promise.all([listMediaAssets(tx, "logo"), listMediaAssets(tx, "photo")]);
    return { logo: logos.at(-1) === undefined ? null : imageOf(logos.at(-1) as MediaAsset), photos: photos.map(imageOf) };
  });
}
