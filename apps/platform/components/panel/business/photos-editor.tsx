"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import type { DirectoryPictureSlot } from "@brandbasket/db";
import { minimumPictureSize, PICTURE_SHAPES, PICTURE_SLOT_LABELS } from "@brandbasket/shared/lib/directory/pictures";
import { PlusIcon } from "@brandbasket/shared/ui/icons";
import { ImageCropper, type CroppedPicture, type CropStep } from "@/components/panel/pictures/image-cropper";
import { StatusLine } from "@/components/panel/status-line";
import {
  freeGallerySlots,
  galleryNeighbour,
  galleryRoom,
  notAnImageMessage,
  photosStatus,
  savingLine,
  tooManyMessage,
  tooSmallMessage,
  type GalleryEntry,
  type GallerySlotName,
} from "@/lib/photos-editor";
import { ownPictureHref } from "@/lib/photos-view";
import { cropBounds, cropRect, startView } from "@/lib/uploads/crop-geometry";
import { cropToBlob, openPhoto } from "@/lib/uploads/crop-image";
import { movePicture, type PicturePlace } from "@/lib/uploads/move-picture";
import { uploadListingPicture } from "@/lib/uploads/upload-client";
import { WhereItShows } from "@/components/panel/where-it-shows";

/*
 * The Photos tab's editor: a small copy of the business's page that the owner taps to add the feature photo (the
 * crop window opens first, so the shape is always right), and one gallery that takes several photos at once.
 * Every photo is cut to its place's shape in the browser and stored by the same route as before, so nothing here
 * changes what is saved: only how the owner gets there. Each photo is live as soon as it is uploaded. A gallery photo
 * can be made the main (feature) photo, which swaps it with the one there, or moved a place earlier or later.
 */

type SingleKind = "listing";

interface PhotosEditorProps {
  /** The feature photo's picture id, or null. */
  readonly feature: string | null;
  /** The gallery places (twenty), in order. */
  readonly gallery: readonly GalleryEntry[];
  /** False once staff have taken the business down: it can look but not add. */
  readonly canChange: boolean;
  /** Whether the page is live, so a new photo shows on it straight away. */
  readonly published: boolean;
  /** A form action that removes one place's picture and redirects back with a notice. */
  readonly removeAction: (formData: FormData) => Promise<void>;
}

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

const SINGLE_STEP: Readonly<Record<SingleKind, CropStep>> = {
  listing: { slot: "listing", title: "Feature photo", where: "On your page, and beside your name in the list." },
};
/** Module-level, so the crop window sees the same list each render. */
const SINGLE_STEPS: Readonly<Record<SingleKind, readonly CropStep[]>> = { listing: [SINGLE_STEP.listing] };

const ZONE =
  "group relative grid w-full place-items-center overflow-hidden border-[1.5px] border-dashed border-ink-soft/45 bg-paper-deep text-sm text-ink-soft transition-colors duration-300 ease-calm hover:border-accent hover:bg-paper-deep/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight-deep disabled:cursor-default disabled:hover:border-ink-soft/45";
const ZONE_FILLED = "border-solid border-transparent";
const TILE_BUTTON =
  "grid h-8 place-items-center rounded-full bg-paper/95 text-ink-soft transition-opacity duration-300 ease-calm hover:text-ink focus-visible:opacity-100 disabled:cursor-default disabled:opacity-40 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100";
const LINK_BUTTON = "rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink";

const ENCODE_FAILED = "Your browser couldn't prepare this photo. Try a different browser, or another photo.";

/** The page asks for fresh data after an upload: a route handler cannot refresh it the way a server action does. */
function refresh(router: ReturnType<typeof useRouter>): void {
  // A notice left in the address by an earlier action ("Photo removed.") is dropped: it is no longer the news.
  const params = new URLSearchParams(window.location.search);
  if (!params.has("notice")) {
    router.refresh();
    return;
  }
  params.delete("notice");
  const rest = params.toString();
  router.replace(rest === "" ? window.location.pathname : `${window.location.pathname}?${rest}`);
}

function Picture({ id, label, slot }: { readonly id: string; readonly label: string; readonly slot: DirectoryPictureSlot }): ReactElement {
  const shape = PICTURE_SHAPES[slot];
  // The image optimiser is skipped: it would fetch the file without the owner's session and be refused.
  return <Image src={ownPictureHref(id)} alt={label} width={shape.width} height={shape.height} unoptimized className="absolute inset-0 size-full object-cover" />;
}

export function PhotosEditor({ feature, gallery, canChange, published, removeAction }: PhotosEditorProps): ReactElement {
  const router = useRouter();
  const featureInput = useRef<HTMLInputElement>(null);
  const [single, setSingle] = useState<{ readonly kind: SingleKind; readonly file: File } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<GallerySlotName | null>(null);
  /** False once the owner has left the page: an upload that finishes after that must not touch where they went. */
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);

  const busy = progress !== null;
  const status = photosStatus(feature !== null, published);
  const free = freeGallerySlots(gallery);
  const filled = gallery.filter((entry) => entry.pictureId !== null);

  function chooseSingle(kind: SingleKind): (event: ChangeEvent<HTMLInputElement>) => void {
    return (event) => {
      const file = event.target.files?.[0] ?? null;
      // Cleared, so choosing the same photo again after a cancel still opens the crop window.
      event.target.value = "";
      if (file === null) return;
      setProblems([]);
      setSaved(null);
      setSingle({ kind, file });
    };
  }

  async function uploadSingle(file: File, pictures: readonly CroppedPicture[]): Promise<void> {
    setSingle(null);
    let failure: string | null = null;
    let stored = 0;
    setProgress("Uploading…");
    for (const picture of pictures) {
      const result = await uploadListingPicture(picture.blob, picture.slot);
      if (!result.ok) {
        failure = result.message;
        break;
      }
      stored += picture.blob.size;
    }
    if (!onPage.current) return;
    setProgress(null);
    setProblems(failure === null ? [] : [failure]);
    setSaved(failure === null ? savingLine(file.size, stored) : null);
    refresh(router);
  }

  async function addGallery(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setProblems([]);
    setSaved(null);

    const messages: string[] = [];
    const { leftOver } = galleryRoom(free.length, files.length);
    let next = 0;
    let originalBytes = 0;
    let storedBytes = 0;
    let handled = 0;
    for (const file of files) {
      if (next >= free.length) break;
      setProgress(files.length === 1 ? "Uploading…" : `Adding photo ${String(handled + 1)} of ${String(files.length)}…`);
      handled += 1;
      const slot = free[next];
      if (slot === undefined) break;
      const bitmap = await openPhoto(file);
      if (bitmap === null) {
        messages.push(notAnImageMessage(file.name));
        continue;
      }
      const shape = PICTURE_SHAPES[slot];
      const minimum = minimumPictureSize(slot);
      const bounds = cropBounds({ width: bitmap.width, height: bitmap.height }, shape, minimum);
      if (bounds === null) {
        bitmap.close();
        messages.push(tooSmallMessage(file.name, minimum));
        continue;
      }
      // Several photos at once are cut about their centre: the owner can remove one and add it again to place it by hand.
      const blob = await cropToBlob(bitmap, cropRect(bounds, startView(bounds)), shape);
      bitmap.close();
      if (blob === null) {
        messages.push(ENCODE_FAILED);
        break;
      }
      const result = await uploadListingPicture(blob, slot);
      if (!result.ok) {
        messages.push(result.message);
        break;
      }
      next += 1;
      originalBytes += file.size;
      storedBytes += blob.size;
    }
    if (leftOver > 0 && next >= free.length) messages.push(tooManyMessage(free.length, leftOver));
    if (!onPage.current) return;
    setProgress(null);
    setProblems(messages);
    setSaved(savingLine(originalBytes, storedBytes));
    refresh(router);
  }

  /** Moves the photo in `from` to `to`, swapping with the one there; into an empty place it is moved, not copied. */
  async function move(from: PicturePlace, to: PicturePlace): Promise<void> {
    setProblems([]);
    setSaved(null);
    setConfirming(null);
    setProgress("Moving…");
    const result = await movePicture(from, to);
    if (result.ok && to.pictureId === null) {
      const form = new FormData();
      form.set("kind", from.slot);
      form.set("moved", "yes");
      // Takes the original out of the gallery and sends the owner back here with a notice.
      await removeAction(form);
    }
    if (!onPage.current) return;
    setProgress(null);
    setProblems(result.ok ? [] : [result.message]);
    refresh(router);
  }

  /** A spot on the page preview. A plain function, not a component: a component declared here would be rebuilt on every render and drop the file chooser. */
  function zone(kind: SingleKind, id: string | null, label: string, children: ReactElement): ReactElement {
    const input = featureInput;
    const shape = PICTURE_SHAPES[SINGLE_STEP[kind].slot];
    return (
      <>
        <button
          type="button"
          disabled={!canChange || busy}
          onClick={() => input.current?.click()}
          aria-label={id === null ? `Add ${label}` : `Change ${label}`}
          className={`${ZONE} ${id === null ? "" : ZONE_FILLED} rounded-[14px]`}
          style={{ aspectRatio: `${String(shape.width)} / ${String(shape.height)}` }}
        >
          {id === null ? children : <Picture id={id} label={label} slot={SINGLE_STEP[kind].slot} />}
          {id !== null && canChange ? (
            <span className="absolute right-2 bottom-2 rounded-full bg-ink/80 px-3 py-1 text-xs text-paper opacity-0 transition-opacity duration-300 ease-calm group-hover:opacity-100 group-focus-visible:opacity-100">Change</span>
          ) : null}
        </button>
        {canChange ? <input ref={input} type="file" accept={ACCEPTED_TYPES} onChange={chooseSingle(kind)} className="sr-only" tabIndex={-1} aria-hidden="true" /> : null}
      </>
    );
  }

  return (
    <section aria-labelledby="photos-title" className="mt-8 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="photos-title" className="panel-section">
          Your page
        </h2>
        <StatusLine tone={status.tone}>{status.text}</StatusLine>
      </div>

      <div className="mt-4 rounded-[18px] border border-line bg-paper p-3.5">
        <div className="flex items-start gap-4">
          <div className="w-36 shrink-0 max-sm:w-28">
            {zone(
              "listing",
              feature,
              "feature photo",
              <span className="grid place-items-center gap-1 text-center">
                <PlusIcon className="size-5" />
                <span>Feature</span>
              </span>,
            )}
          </div>
          <div className="min-w-0 flex-1 pt-2" aria-hidden="true">
            <div className="h-3.5 w-3/5 rounded-full bg-paper-deep" />
            <div className="mt-2.5 h-2.5 w-2/5 rounded-full bg-paper-deep" />
            <div className="mt-5 flex gap-2">
              {[0, 1, 2].map((index) => {
                const entry = filled[index];
                return (
                  <div key={index} className="relative h-12 w-16 overflow-hidden rounded-[10px] bg-paper-deep max-sm:h-10 max-sm:w-14">
                    {entry === undefined || entry.pictureId === null ? null : <Picture id={entry.pictureId} label="" slot={entry.slot} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2.5 px-1 text-sm text-ink-soft">{canChange ? "Tap any spot on your page to add or change its photo." : "This is how your page's photos look."}</p>
      <div className="mt-1 px-1">
        <WhereItShows spot="cover-photos" caption="Your feature photo shows at the top of your page, above your business name." />
      </div>

      {canChange && feature !== null ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {feature === null ? null : (
            <form action={removeAction}>
              <input type="hidden" name="kind" value="listing" />
              <button type="submit" disabled={busy} className={LINK_BUTTON}>
                Remove feature photo
              </button>
            </form>
          )}
        </div>
      ) : null}

      <div className="mt-10 flex items-baseline justify-between border-t border-line pt-6">
        <h2 className="panel-section">Gallery</h2>
        <span className="text-sm text-ink-soft">
          {String(filled.length)} of {String(gallery.length)}
        </span>
      </div>
      <div className="mt-1">
        <WhereItShows spot="gallery" caption="Your gallery photos show in the Gallery section of your page." />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filled.map((entry, index) => {
          const before = galleryNeighbour(gallery, entry.slot, -1);
          const after = galleryNeighbour(gallery, entry.slot, 1);
          return (
            <li key={entry.slot} className="group relative aspect-[4/3] overflow-hidden rounded-[12px] bg-paper-deep">
              {entry.pictureId === null ? null : <Picture id={entry.pictureId} label={`Gallery photo ${String(index + 1)}`} slot={entry.slot} />}
              {index === 0 ? <span className="absolute bottom-2 left-2 rounded-md bg-paper/95 px-2 py-0.5 text-xs">First</span> : null}
              {!canChange || confirming === entry.slot ? null : (
                <>
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    {before === null ? null : (
                      <button type="button" disabled={busy} onClick={() => void move(entry, before)} aria-label={`Move gallery photo ${String(index + 1)} earlier`} className={`${TILE_BUTTON} w-8`}>
                        <span aria-hidden="true">‹</span>
                      </button>
                    )}
                    {after === null ? null : (
                      <button type="button" disabled={busy} onClick={() => void move(entry, after)} aria-label={`Move gallery photo ${String(index + 1)} later`} className={`${TILE_BUTTON} w-8`}>
                        <span aria-hidden="true">›</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void move(entry, { slot: "listing", pictureId: feature })}
                    aria-label={`Make gallery photo ${String(index + 1)} the main photo`}
                    className={`${TILE_BUTTON} absolute right-2 bottom-2 px-3 text-xs font-semibold text-ink`}
                  >
                    Make main
                  </button>
                </>
              )}
              {!canChange ? null : confirming === entry.slot ? (
                <form action={removeAction} className="absolute inset-0 grid place-content-center gap-2 bg-ink/65 p-3 text-center text-paper">
                  <input type="hidden" name="kind" value={entry.slot} />
                  <p className="text-sm">Remove this photo?</p>
                  <div className="flex justify-center gap-2">
                    <button type="submit" className="rounded-full bg-paper px-3.5 py-1.5 text-sm font-semibold text-ink">
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-full px-3.5 py-1.5 text-sm">
                      Keep
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(entry.slot)}
                  aria-label={`Remove ${PICTURE_SLOT_LABELS[entry.slot].toLowerCase()}`}
                  className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-paper/95 text-ink-soft transition-opacity duration-300 ease-calm hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </li>
          );
        })}
        {!canChange ? null : (
          <li>
            <label
              className={`grid aspect-[4/3] cursor-pointer place-content-center gap-1 rounded-[12px] border-[1.5px] border-dashed border-ink-soft/45 text-center text-sm text-ink-soft transition-colors duration-300 ease-calm hover:border-accent hover:bg-paper-deep focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-highlight-deep has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55`}
            >
              <PlusIcon className="mx-auto size-5" />
              {free.length === 0 ? (
                <>
                  <span>Gallery is full</span>
                  <span className="text-xs">Remove one to add another</span>
                </>
              ) : (
                <>
                  <span>Add photos</span>
                  <span className="text-xs">Choose several at once</span>
                </>
              )}
              <input type="file" accept={ACCEPTED_TYPES} multiple disabled={busy || free.length === 0} onChange={(event) => void addGallery(event)} className="sr-only" />
            </label>
          </li>
        )}
      </ul>

      <p aria-live="polite" className="mt-4 text-sm text-ink-soft empty:hidden">
        {progress ?? ""}
      </p>
      {problems.length === 0 ? null : (
        <ul role="alert" className="mt-4 grid max-w-xl gap-2">
          {problems.map((message) => (
            <li key={message} className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
              {message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 px-1 text-sm text-ink-soft">
        We resize and compress every photo for you.
        {saved === null ? null : <span className="text-emerald-700"> Saved: {saved}.</span>}
      </p>

      {single === null ? null : (
        <ImageCropper
          file={single.file}
          steps={SINGLE_STEPS[single.kind]}
          onCancel={() => setSingle(null)}
          onDone={(pictures) => void uploadSingle(single.file, pictures)}
        />
      )}
    </section>
  );
}
