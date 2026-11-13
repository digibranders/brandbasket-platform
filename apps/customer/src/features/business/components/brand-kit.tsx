"use client";

import { UPLOAD_FILE_NAME_HEADER, type UploadPurpose } from "@brandbasket/shared/lib/uploads/limits";
import { prepareImageForUpload } from "@brandbasket/shared/lib/uploads/prepare-image";
import { sendImage } from "@brandbasket/shared/lib/uploads/send-image";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Panel } from "@/components";
import { formatBytes } from "@/lib/format";
import { Banner, Button, FileDrop, type FileDropItem } from "@/ui";
import { removeBrandAssetAction } from "../actions";
import type { BrandImage } from "../brand-media";
import { MAX_PHOTOS, MAX_UPLOAD_SIZE_LABEL, planUpload } from "../rules";

/** The old app's route for the Business page's logo and photos. It stays in apps/platform; see the report on how the browser reaches it. */
export const BRAND_ASSETS_ROUTE = "/api/brand-assets";
// iPhones convert HEIC photos to JPEG when HEIC is not listed here.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const SEND_TO_TEAM_HREF = "/requests?new=1";

export interface BrandKitProps {
  readonly logo: BrandImage | null;
  readonly photos: readonly BrandImage[];
  readonly readOnly: boolean;
}

/** A stored image, served from the tenant-checked media route. The image optimiser is skipped: it would fetch without the session. */
function Thumbnail({ image, alt, fit }: { readonly image: BrandImage; readonly alt: string; readonly fit: "cover" | "contain" }) {
  const width = 320;
  const height = Math.max(1, Math.round((image.height / Math.max(1, image.width)) * width));
  return (
    <Image
      src={`/media/${image.id}`}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={`aspect-4/3 w-full rounded-control border border-border bg-surface-subtle ${fit === "cover" ? "object-cover" : "object-contain p-3"}`}
    />
  );
}

/**
 * Logo and photos: choose, replace and remove. Each file is shrunk in the browser and sent to the brand assets route one at a
 * time, then the page refreshes to show what was stored. A photo added here has no description; the team adds one.
 */
export function BrandKit({ logo, photos, readOnly }: BrandKitProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [problems, setProblems] = useState<Readonly<Record<UploadPurpose, readonly FileDropItem[]>>>({ logo: [], photo: [] });
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const busy = uploading || removing;

  async function handleFiles(purpose: UploadPurpose, chosen: readonly File[]): Promise<void> {
    const { accepted, turnedAway } = planUpload(purpose, chosen, photos.length);
    const found: FileDropItem[] = turnedAway.map(({ file, message }, index) => ({ id: `away-${index}-${file.name}`, name: file.name, size: formatBytes(file.size), error: message }));
    setUploading(true);
    setProblems((previous) => ({ ...previous, [purpose]: [] }));
    setRemoveError(undefined);
    let stored = 0;
    for (const file of accepted) {
      const body = await prepareImageForUpload(file, purpose);
      const result = await sendImage(`${BRAND_ASSETS_ROUTE}?purpose=${purpose}`, body, { [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name) });
      if (result.ok) stored += 1;
      else found.push({ id: `failed-${found.length}-${file.name}`, name: file.name, size: formatBytes(file.size), error: result.message });
    }
    setProblems((previous) => ({ ...previous, [purpose]: found }));
    setUploading(false);
    if (stored > 0) router.refresh();
  }

  const remove = (image: BrandImage) => {
    setRemoveError(undefined);
    startRemoving(async () => {
      const result = await removeBrandAssetAction(image.id);
      if (!result.ok) setRemoveError(result.message);
    });
  };

  const description = (
    <>
      JPEG, PNG or WebP, up to {MAX_UPLOAD_SIZE_LABEL} each. We shrink large photos. For other files, such as an SVG logo,{" "}
      <Link href={SEND_TO_TEAM_HREF}>send them to the team</Link>.
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {removeError === undefined ? null : <Banner tone="neg">{removeError}</Banner>}
      <Panel title="Logo">
        <div className="flex flex-col gap-4">
          {logo === null ? (
            <p className="type-body text-ink-3">No logo yet. We set your name in a clean typeface until you add one.</p>
          ) : (
            <div className="flex max-w-xs flex-col gap-2">
              <Thumbnail image={logo} alt="Your logo" fit="contain" />
              {readOnly ? null : (
                <div>
                  <Button size="sm" disabled={busy} onClick={() => remove(logo)}>
                    Remove logo
                  </Button>
                </div>
              )}
            </div>
          )}
          {readOnly ? null : (
            <FileDrop
              chooseLabel={logo === null ? "Upload your logo" : "Replace your logo"}
              description={description}
              accept={ACCEPTED_TYPES}
              disabled={busy}
              onFiles={(files) => void handleFiles("logo", files)}
              files={problems.logo}
            />
          )}
        </div>
      </Panel>
      <Panel title="Photos" meta={`${photos.length} of ${MAX_PHOTOS}`}>
        <div className="flex flex-col gap-4">
          {photos.length === 0 ? null : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo, index) => (
                <li key={photo.id} className="flex min-w-0 flex-col gap-1">
                  <Thumbnail image={photo} alt={photo.altText ?? `Photo ${index + 1}`} fit="cover" />
                  {readOnly ? null : (
                    <div>
                      <Button size="sm" disabled={busy} aria-label={`Remove photo ${index + 1}`} onClick={() => remove(photo)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {readOnly ? null : (
            <FileDrop
              chooseLabel="Add photos"
              description={description}
              accept={ACCEPTED_TYPES}
              multiple
              disabled={busy || photos.length >= MAX_PHOTOS}
              onFiles={(files) => void handleFiles("photo", files)}
              files={problems.photo}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
