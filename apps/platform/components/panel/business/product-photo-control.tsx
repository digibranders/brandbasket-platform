"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { PRODUCT_PHOTO_MINIMUM, PRODUCT_PHOTO_SIZE } from "@brandbasket/shared/lib/directory/pictures";
import { ownProductPhotoHref } from "@/lib/photos-view";
import { cropBounds, cropRect, startView } from "@/lib/uploads/crop-geometry";
import { cropToBlob, openPhoto } from "@/lib/uploads/crop-image";
import { uploadProductPhoto } from "@/lib/uploads/upload-client";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const NOT_AN_IMAGE = "We couldn't read that file. Please choose a JPEG, PNG or WebP photo.";
const TOO_SMALL = `That photo is too small. Please choose one at least ${String(PRODUCT_PHOTO_MINIMUM.width)} pixels across.`;
const ENCODE_FAILED = "We couldn't prepare that photo. Please try another.";

interface ProductPhotoControlProps {
  readonly productId: string;
  readonly productName: string;
  /** The photo the product has now, or null. */
  readonly photoId: string | null;
  /** The Remove photo form's action: posts the product's id. */
  readonly removeAction: (formData: FormData) => Promise<void>;
}

/**
 * One product's photo, in its edit sheet: the photo as it shows on the page, and a button to add or change it. A chosen
 * photo is cut to a square about its centre in the browser (so a phone photo is small enough to send) and goes up at
 * once; it is live as soon as it is stored, like a gallery photo. Remove takes it off again.
 */
export function ProductPhotoControl({ productId, productName, photoId, removeAction }: ProductPhotoControlProps): ReactElement {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** False once the owner has left the page: an upload that finishes after that must not touch where they went. */
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    // Cleared, so choosing the same photo again after a failure still runs.
    event.target.value = "";
    if (file === null) return;
    setProblem(null);
    setBusy(true);
    const message = await prepareAndSend(file, productId);
    if (!onPage.current) return;
    setBusy(false);
    setProblem(message);
    if (message === null) router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-line bg-paper-deep text-xs text-ink-soft">
        {photoId === null ? (
          <span>No photo</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the owner's own file, served by the app host with no session-less caching
          <img src={ownProductPhotoHref(photoId)} alt={`Photo of ${productName}`} width={96} height={96} className="size-full object-cover" />
        )}
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label
            htmlFor={inputId}
            className={`link-underline cursor-pointer text-sm font-medium text-accent-deep ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? "Uploading…" : photoId === null ? "Add a photo" : "Change photo"}
            <span className="sr-only"> for {productName}</span>
          </label>
          <input id={inputId} ref={input} type="file" accept={ACCEPTED_TYPES} onChange={(event) => void choose(event)} disabled={busy} className="sr-only" />
          {photoId === null ? null : (
            <form action={removeAction}>
              <input type="hidden" name="id" value={productId} />
              <button type="submit" disabled={busy} className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-accent-deep">
                Remove photo<span className="sr-only"> of {productName}</span>
              </button>
            </form>
          )}
        </div>
        <p className="text-xs text-ink-soft">Square works best. It shows on your page as soon as it is added.</p>
        {problem === null ? null : (
          <p role="alert" className="text-sm text-accent-deep">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

/** Cuts the chosen file to a square, sends it, and returns what went wrong, or null when it is stored. */
async function prepareAndSend(file: File, productId: string): Promise<string | null> {
  const bitmap = await openPhoto(file);
  if (bitmap === null) return NOT_AN_IMAGE;
  try {
    const bounds = cropBounds({ width: bitmap.width, height: bitmap.height }, PRODUCT_PHOTO_SIZE, PRODUCT_PHOTO_MINIMUM);
    if (bounds === null) return TOO_SMALL;
    const blob = await cropToBlob(bitmap, cropRect(bounds, startView(bounds)), PRODUCT_PHOTO_SIZE);
    if (blob === null) return ENCODE_FAILED;
    const result = await uploadProductPhoto(blob, productId);
    return result.ok ? null : result.message;
  } finally {
    bitmap.close();
  }
}
