"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from "react";
import type { DirectoryPictureSlot } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";
import { PICTURE_KIND_SLOTS, PICTURE_KINDS, PICTURE_SHAPES, PICTURE_SLOT_LABELS, type PictureKind } from "@brandbasket/shared/lib/directory/pictures";
import { PlusIcon } from "@brandbasket/shared/ui/icons";
import { ImageCropper, type CroppedPicture, type CropStep } from "@/components/panel/pictures/image-cropper";
import { ownPictureHref } from "@/lib/photos-view";
import { uploadListingPicture } from "@/lib/uploads/upload-client";
import { WhereItShows } from "@/components/panel/where-it-shows";
import type { WhereItShowsSpot } from "@/lib/where-it-shows";

/*
 * One kind of picture on the Photos page: the listing photo, or the ad picture in its two shapes. The frames are the
 * layout's own shapes, so the owner sees what each will look like. Choosing a photo opens the crop window before
 * anything is sent; each finished crop is then uploaded to its slot and the page asks for fresh data.
 */

export interface PicturePreview {
  readonly slot: DirectoryPictureSlot;
  /** The owner's newest picture for the slot, or null for a slot still empty. */
  readonly pictureId: string | null;
}

interface PictureCardProps {
  readonly kind: PictureKind;
  readonly title: string;
  /** Where the picture shows, in one short line. */
  readonly where: string;
  /** The "See where this shows" picture for this card, when the public page has a matching spot. */
  readonly shows?: { readonly spot: WhereItShowsSpot; readonly caption: string };
  readonly previews: readonly PicturePreview[];
  /** Where the picture stands, already worded by the page; null when there is none. */
  readonly status: ReactNode;
  /** False for an account whose claim was refused: it can look but not add. */
  readonly canUpload: boolean;
  /** A form action that removes this kind's pictures and redirects back with a notice. */
  readonly removeAction: (formData: FormData) => Promise<void>;
}

const SLOT_WHERE: Readonly<Record<DirectoryPictureSlot, string>> = {
  listing: "Beside your name in the list, and on your page.",
  ad_tall: "Your ad in the first side spot.",
  ad_wide: "Your ad in the second side spot.",
  banner: "Across the top of your page.",
  gallery_1: "In your page's gallery.",
  gallery_2: "In your page's gallery.",
  gallery_3: "In your page's gallery.",
  gallery_4: "In your page's gallery.",
  gallery_5: "In your page's gallery.",
  gallery_6: "In your page's gallery.",
  gallery_7: "In your page's gallery.",
  gallery_8: "In your page's gallery.",
  gallery_9: "In your page's gallery.",
  gallery_10: "In your page's gallery.",
  gallery_11: "In your page's gallery.",
  gallery_12: "In your page's gallery.",
  gallery_13: "In your page's gallery.",
  gallery_14: "In your page's gallery.",
  gallery_15: "In your page's gallery.",
  gallery_16: "In your page's gallery.",
  gallery_17: "In your page's gallery.",
  gallery_18: "In your page's gallery.",
  gallery_19: "In your page's gallery.",
  gallery_20: "In your page's gallery.",
};

/** Each picture is cropped once per shape, in the kind's order. Module-level, so the crop window sees the same list each render. */
const CROP_STEPS: ReadonlyMap<PictureKind, readonly CropStep[]> = new Map(
  PICTURE_KINDS.map((kind) => [kind, PICTURE_KIND_SLOTS[kind].map((slot) => ({ slot, title: PICTURE_SLOT_LABELS[slot], where: SLOT_WHERE[slot] }))]),
);

function cropStepsOf(kind: PictureKind): readonly CropStep[] {
  const steps = CROP_STEPS.get(kind);
  if (steps === undefined) throw new Error(`No crop steps for the picture kind "${kind}".`);
  return steps;
}

/** Every frame is this tall, so the shapes can be compared at a glance; the width follows from the shape. */
const FRAME = "h-40 shrink-0 overflow-hidden rounded-[14px] bg-paper-deep";

// iPhones convert HEIC photos to JPEG when HEIC is not listed here.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const PICKER =
  "inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors duration-300 ease-calm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-highlight-deep hover:bg-accent-deep has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55";
const REMOVE = "rounded-full px-3 py-2 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink disabled:opacity-40";

interface Progress {
  readonly done: number;
  readonly total: number;
}

/** One slot in its own shape. `named` adds the shape's name under it, for a picture that has more than one. */
function Frame({ preview, named }: { readonly preview: PicturePreview; readonly named: boolean }): ReactElement {
  const shape = PICTURE_SHAPES[preview.slot];
  const label = PICTURE_SLOT_LABELS[preview.slot];
  return (
    <li className="grid gap-2">
      <div className={FRAME} style={{ aspectRatio: `${shape.width} / ${shape.height}` }}>
        {preview.pictureId === null ? (
          <span className="grid size-full place-items-center text-ink-soft/55">
            <PlusIcon className="size-5" />
          </span>
        ) : (
          // The image optimiser is skipped: it would fetch the file without the owner's session and be refused.
          <Image
            src={ownPictureHref(preview.pictureId)}
            alt={label}
            width={shape.width}
            height={shape.height}
            unoptimized
            className="size-full object-cover"
          />
        )}
      </div>
      {named ? <span className="text-[0.8125rem] text-ink-soft">{label}</span> : null}
    </li>
  );
}

export function PictureCard({ kind, title, where, shows, previews, status, canUpload, removeAction }: PictureCardProps): ReactElement {
  const router = useRouter();
  const [chosen, setChosen] = useState<File | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** False once the owner has left the page: an upload that finishes after that must not touch where they went. */
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);
  const hasPicture = previews.some((preview) => preview.pictureId !== null);
  const busy = progress !== null;
  const headingId = `pictures-${kind}`;

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // Cleared, so choosing the same photo again after a cancel still opens the crop window.
    event.target.value = "";
    if (file === null) return;
    setProblem(null);
    setChosen(file);
  }

  async function upload(pictures: readonly CroppedPicture[]): Promise<void> {
    setChosen(null);
    let failure: string | null = null;
    for (const [index, picture] of pictures.entries()) {
      setProgress({ done: index, total: pictures.length });
      const result = await uploadListingPicture(picture.blob, picture.slot);
      if (!result.ok) {
        failure = result.message;
        break;
      }
    }
    if (!onPage.current) return;
    setProgress(null);
    setProblem(failure);
    // The route handler cannot refresh this page the way a server action does, so the page asks for fresh data. A
    // notice left in the address by an earlier action ("Removed.") is dropped with it: it is no longer the news. The
    // rest of the address stays, such as the Business profile's open tab.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("notice")) router.refresh();
    else {
      params.delete("notice");
      const rest = params.toString();
      router.replace(rest === "" ? window.location.pathname : `${window.location.pathname}?${rest}`);
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-10 border-t border-line pt-6">
      <h2 id={headingId} className="panel-section">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{where}</p>
      {shows === undefined ? null : (
        <div className="mt-1">
          <WhereItShows spot={shows.spot} caption={shows.caption} />
        </div>
      )}

      <ul className="mt-5 flex flex-wrap items-start gap-4">
        {previews.map((preview) => (
          <Frame key={preview.slot} preview={preview} named={previews.length > 1} />
        ))}
      </ul>

      {status === null ? null : <div className="mt-5">{status}</div>}

      <div className={cn("flex flex-wrap items-center gap-2", status === null ? "mt-5" : "mt-4")}>
        {canUpload ? (
          <label className={PICKER}>
            {hasPicture ? "Replace" : "Add photo"}
            <input type="file" accept={ACCEPTED_TYPES} disabled={busy} onChange={handleFile} className="sr-only" />
          </label>
        ) : null}
        {hasPicture ? (
          <form action={removeAction}>
            <input type="hidden" name="kind" value={kind} />
            <button type="submit" disabled={busy} className={REMOVE}>
              Remove<span className="sr-only"> {title.toLowerCase()}</span>
            </button>
          </form>
        ) : null}
        <p aria-live="polite" className="text-sm text-ink-soft empty:hidden">
          {progress === null ? "" : progress.total === 1 ? "Uploading…" : `Uploading ${progress.done + 1} of ${progress.total}…`}
        </p>
      </div>

      {problem === null ? null : (
        <p role="alert" className="mt-4 max-w-xl rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {problem}
        </p>
      )}

      {chosen === null ? null : (
        <ImageCropper file={chosen} steps={cropStepsOf(kind)} onCancel={() => setChosen(null)} onDone={(pictures) => void upload(pictures)} />
      )}
    </section>
  );
}
