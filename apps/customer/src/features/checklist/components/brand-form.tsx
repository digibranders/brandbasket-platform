"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UPLOAD_FILE_NAME_HEADER, MAX_UPLOAD_SIZE_LABEL, type UploadPurpose } from "@brandbasket/shared/lib/uploads/limits";
import { prepareImageForUpload } from "@brandbasket/shared/lib/uploads/prepare-image";
import { sendImage } from "@brandbasket/shared/lib/uploads/send-image";
import { formatBytes } from "@/lib/format";
import { Banner, Button, FileDrop, Textarea, type FileDropItem } from "@/ui";
import { removeImageAction, saveBrandItem } from "../actions";
import { MAX_DESCRIPTION_LENGTH, MAX_PHOTOS, photoDescriptionField } from "../rules-brand";
import { FormField, ItemForm } from "./item-form";
import { SectionLabel } from "./section-label";

/** Under this page, outside the proxy and server action body limits. */
const UPLOAD_ROUTE = "/checklist/upload";

export interface BrandImage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
  readonly originalFilename: string;
}

export interface BrandFormProps {
  readonly logo: BrandImage | null;
  readonly photos: readonly BrandImage[];
  readonly readOnlyReason: string | null;
}

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
      className={fit === "cover" ? "aspect-4/3 w-full rounded-control border border-border-subtle object-cover" : "aspect-4/3 w-full rounded-control border border-border-subtle object-contain p-3"}
    />
  );
}

/**
 * Logo and photos. Each file is shrunk in the browser and uploaded on its own as soon as it is picked; the sheet's Save then
 * stores a description for every photo, which is what makes the item done.
 */
export function BrandForm({ logo, photos, readOnlyReason }: BrandFormProps) {
  const router = useRouter();
  const [items, setItems] = useState<readonly FileDropItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const readOnly = readOnlyReason !== null;
  const busy = uploading || removing;
  const photoSlots = Math.max(0, MAX_PHOTOS - photos.length);

  async function upload(purpose: UploadPurpose, chosen: readonly File[]): Promise<void> {
    const files = purpose === "logo" ? chosen.slice(0, 1) : chosen.slice(0, photoSlots);
    const refused: FileDropItem[] =
      purpose === "photo" && chosen.length > photoSlots
        ? [{ id: "too-many", name: `${chosen.length - photoSlots} of the photos you chose`, size: "", error: `You can add up to ${MAX_PHOTOS} photos, so these weren’t uploaded.` }]
        : [];
    setUploading(true);
    setRemoveError(null);
    setItems(refused);
    const failed: FileDropItem[] = [...refused];
    let stored = 0;
    for (const [index, file] of files.entries()) {
      const id = `${index}-${file.name}`;
      setItems([...failed, { id, name: file.name, size: formatBytes(file.size), progress: 50 }]);
      const body = await prepareImageForUpload(file, purpose);
      const result = await sendImage(`${UPLOAD_ROUTE}?purpose=${purpose}`, body, { [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name) });
      if (result.ok) stored += 1;
      else failed.push({ id, name: file.name, size: formatBytes(file.size), error: result.message });
    }
    setItems(failed);
    setUploading(false);
    // A route handler cannot refresh this page the way a server action does, so the page asks for fresh data.
    if (stored > 0) router.refresh();
  }

  function remove(image: BrandImage): void {
    setRemoveError(null);
    startRemoving(async () => {
      const result = await removeImageAction(image.id);
      if (!result.ok) setRemoveError(result.message);
    });
  }

  return (
    <ItemForm title="Logo and photos" action={saveBrandItem} readOnly={readOnly} {...(readOnly ? { readOnlyReason } : {})}>
      <SectionLabel>Your logo (optional)</SectionLabel>
      {logo === null ? null : (
        <div className="flex items-end gap-4">
          <div className="w-40">
            <Thumbnail image={logo} alt="Your logo" fit="contain" />
          </div>
          {readOnly ? null : (
            <Button size="sm" variant="ghost" icon="Trash" disabled={busy} onClick={() => remove(logo)}>
              Remove logo
            </Button>
          )}
        </div>
      )}
      {readOnly ? null : (
        <FileDrop
          chooseLabel={logo === null ? "Choose a logo" : "Replace your logo"}
          description={`JPG, PNG or WebP. Large images are shrunk to ${MAX_UPLOAD_SIZE_LABEL} or less.`}
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onFiles={(files) => void upload("logo", files)}
        />
      )}

      <SectionLabel>Photos</SectionLabel>
      {photos.length === 0 ? null : (
        <ul className="flex flex-col gap-4">
          {photos.map((photo) => {
            const name = photoDescriptionField(photo.id);
            return (
              <li key={photo.id} className="flex flex-col gap-2">
                <Thumbnail image={photo} alt={photo.altText ?? ""} fit="cover" />
                <FormField name={name} label="Describe the photo for people who can’t see it">
                  <Textarea name={name} defaultValue={photo.altText ?? ""} maxLength={MAX_DESCRIPTION_LENGTH} rows={2} />
                </FormField>
                {readOnly ? null : (
                  <Button size="sm" variant="ghost" icon="Trash" className="self-start" disabled={busy} onClick={() => remove(photo)}>
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {readOnly ? null : (
        <FileDrop
          chooseLabel="Add photos"
          description={`Your place, your team, your work. Up to ${MAX_PHOTOS} images. You have ${photos.length} of ${MAX_PHOTOS}.`}
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || photoSlots === 0}
          onFiles={(files) => void upload("photo", files)}
          files={items}
        />
      )}
      {removeError === null ? null : <Banner tone="neg">{removeError}</Banner>}
    </ItemForm>
  );
}
