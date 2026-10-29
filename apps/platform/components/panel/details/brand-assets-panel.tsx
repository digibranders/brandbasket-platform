"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type ReactElement } from "react";
import { MediaThumbnail } from "@/components/panel/media-thumbnail";
import { MAX_PHOTOS } from "@/lib/onboarding/brand-form";
import type { BrandAssets, BrandImage } from "@/lib/server/brand-assets";
import { MAX_UPLOAD_SIZE_LABEL, type UploadPurpose } from "@/lib/uploads/limits";
import { BRAND_ASSETS_ROUTE, uploadImage, type UploadResult } from "@/lib/uploads/upload-client";

interface BrandAssetsPanelProps {
  readonly assets: BrandAssets;
  readonly remove: (mediaId: string) => Promise<UploadResult>;
}

interface Problem {
  readonly fileName: string;
  readonly message: string;
}

// iPhones convert HEIC photos to JPEG when HEIC is not listed here.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const PICKER =
  "inline-flex h-11 w-fit cursor-pointer items-center rounded-lg bg-sunken px-4 text-[0.9375rem] font-semibold text-ink transition-colors duration-200 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rattan hover:bg-line has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45";
const REMOVE = "rounded-lg px-3 py-2 text-[0.8125rem] font-semibold text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink disabled:opacity-45";

function Picker({ purpose, label, disabled, onFiles }: { readonly purpose: UploadPurpose; readonly label: string; readonly disabled: boolean; readonly onFiles: (purpose: UploadPurpose, files: readonly File[]) => void }): ReactElement {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFiles(purpose, files);
  }
  return (
    <label className={PICKER}>
      {label}
      <input type="file" accept={ACCEPTED_TYPES} multiple={purpose === "photo"} disabled={disabled} onChange={handleChange} className="sr-only" />
    </label>
  );
}

/**
 * The business's logo and photos after the website is built: add, replace and remove them. Each file is shrunk in the browser
 * and sent to the brand assets route, one at a time, and the page then refreshes to show what was stored. Descriptions for
 * people who cannot see a photo were written during setup; a photo added here has none until the team adds one.
 */
export function BrandAssetsPanel({ assets, remove }: BrandAssetsPanelProps): ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<readonly Problem[]>([]);
  const photoSlots = Math.max(0, MAX_PHOTOS - assets.photos.length);

  async function handleFiles(purpose: UploadPurpose, chosen: readonly File[]): Promise<void> {
    const files = purpose === "logo" ? chosen.slice(0, 1) : chosen.slice(0, photoSlots);
    const found: Problem[] = chosen.slice(files.length).map((file) => ({ fileName: file.name, message: purpose === "photo" ? `You can keep up to ${MAX_PHOTOS} photos, so this one was not added.` : "Add one logo at a time." }));
    setBusy(true);
    setProblems([]);
    let stored = 0;
    for (const file of files) {
      const result = await uploadImage(file, purpose, BRAND_ASSETS_ROUTE);
      if (result.ok) stored += 1;
      else found.push({ fileName: file.name, message: result.message });
    }
    setProblems(found);
    setBusy(false);
    if (stored > 0) router.refresh();
  }

  async function handleRemove(image: BrandImage): Promise<void> {
    setBusy(true);
    setProblems([]);
    const result = await remove(image.id);
    if (!result.ok) setProblems([{ fileName: image.originalFilename, message: result.message }]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink">Logo</h3>
        {assets.logo === null ? (
          <p className="text-[0.9375rem] text-ink-2">No logo yet. We set your name in a clean typeface until you add one.</p>
        ) : (
          <div className="grid max-w-xs gap-2">
            <MediaThumbnail asset={assets.logo} alt="Your logo" fit="contain" />
            <button type="button" disabled={busy} onClick={() => void handleRemove(assets.logo as BrandImage)} className={`${REMOVE} w-fit`}>
              Remove logo
            </button>
          </div>
        )}
        <Picker purpose="logo" label={assets.logo === null ? "Upload your logo" : "Replace your logo"} disabled={busy} onFiles={(purpose, files) => void handleFiles(purpose, files)} />
      </div>

      <div className="grid gap-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink">
          Photos <span className="font-normal tabular-nums text-ink-2">{assets.photos.length} of {MAX_PHOTOS}</span>
        </h3>
        {assets.photos.length === 0 ? null : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {assets.photos.map((photo, index) => (
              <li key={photo.id} className="min-w-0">
                <MediaThumbnail asset={photo} alt={photo.altText ?? `Photo ${index + 1}`} />
                <button type="button" disabled={busy} onClick={() => void handleRemove(photo)} className={`${REMOVE} mt-1`} aria-label={`Remove photo ${index + 1}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <Picker purpose="photo" label="Add photos" disabled={busy || photoSlots === 0} onFiles={(purpose, files) => void handleFiles(purpose, files)} />
        <p className="text-[0.8125rem] text-ink-2">
          JPEG, PNG or WebP, up to {MAX_UPLOAD_SIZE_LABEL} each. We shrink large photos. For other files, such as an SVG logo, {" "}
          <a href="/requests/new?intent=send_info" className="font-semibold text-ink underline underline-offset-[3px]">
            send them to the team
          </a>
          .
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "Uploading" : ""}
      </p>
      {problems.length === 0 ? null : (
        <ul role="alert" className="grid gap-1">
          {problems.map((problem) => (
            <li key={`${problem.fileName}-${problem.message}`} className="text-[0.9375rem] font-semibold text-error">
              {problem.fileName}: {problem.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
