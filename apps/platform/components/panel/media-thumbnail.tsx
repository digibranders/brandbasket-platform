import type { MediaAsset } from "@brandbasket/db";
import Image from "next/image";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

interface MediaThumbnailProps {
  readonly asset: Pick<MediaAsset, "id" | "width" | "height">;
  readonly alt: string;
  /** Photos fill the frame; a logo is shown whole. */
  readonly fit?: "cover" | "contain";
}

/**
 * A stored image, served from the tenant-checked media route. The image optimiser is skipped: it would fetch the
 * file without the customer's session and be refused.
 */
export function MediaThumbnail({ asset, alt, fit = "cover" }: MediaThumbnailProps): ReactElement {
  const width = 320;
  const height = Math.max(1, Math.round((asset.height / Math.max(1, asset.width)) * width));
  return (
    <Image
      src={`/media/${asset.id}`}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={cn(
        "aspect-[4/3] w-full rounded-control border border-line/70 bg-paper-deep",
        fit === "cover" ? "object-cover" : "object-contain p-3",
      )}
    />
  );
}
