"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactElement } from "react";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { autoFocal, bigEnough, CENTRE, coverRect, dragFocal, encodeWithin, type CropSize, type Focal, type LumaGrid } from "@/lib/staff-ad-crop";

/** What the browser hands the server: the picture already cut to the spot, as WebP. */
const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.86;
/** The longest side of the small greyscale copy the best part of a picture is looked for in. */
const GRID_SIDE = 96;

export interface StaffAdPictureState {
  /** What staff chose, as they chose it. */
  readonly source: File | null;
  /** Which part of it shows. */
  readonly focal: Focal;
  /** Whether the part that shows is chosen automatically, and the file squeezed small; dragging the picture takes the choice of the part by hand. */
  readonly auto: boolean;
}

/** A field with nothing chosen: automatic by default, because most photos need no hand-fitting. */
export const NO_PICTURE: StaffAdPictureState = { source: null, focal: CENTRE, auto: true };

/**
 * The ref for the hidden file input a form posts the cut picture in: it holds the cut file, or nothing, whenever the
 * cut changes or the form remounts after a refusal.
 */
export function useHiddenPictureInput(cut: File | null): (input: HTMLInputElement | null) => void {
  return useCallback(
    (input: HTMLInputElement | null): void => {
      if (input === null) return;
      const files = new DataTransfer();
      if (cut !== null) files.items.add(cut);
      input.files = files.files;
    },
    [cut],
  );
}

interface StaffAdPictureFieldProps {
  readonly state: StaffAdPictureState;
  readonly onChange: (state: StaffAdPictureState) => void;
  /** The cut picture to post, or null when there is none; held by the form so it survives a refused submit. */
  readonly onCut: (file: File | null) => void;
  /** The shape of the chosen spot, in the pixels it is stored at. */
  readonly size: CropSize;
  readonly spotLabel: string;
  readonly invalid: boolean;
  /** Set when staff pressed Place ad while the chosen picture could not be used. */
  readonly blocked: boolean;
  readonly describedBy: string | undefined;
  /** The file input's id; the field's hint and error take theirs from it, so two fields can share a page. */
  readonly id?: string;
  /** What the hint says the picture is for, when it is not "Shown in <spot>". */
  readonly hint?: string;
}

async function readBitmap(file: File): Promise<ImageBitmap> {
  // `from-image` applies the photo's own rotation, as the server does.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function toFile(canvas: HTMLCanvasElement, quality: number = OUTPUT_QUALITY): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob === null ? null : new File([blob], "ad.webp", { type: OUTPUT_TYPE })), OUTPUT_TYPE, quality);
  });
}

/** A small greyscale copy of the picture, for finding its best part. */
function lumaGridOf(bitmap: ImageBitmap): LumaGrid | null {
  const scale = Math.min(1, GRID_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(2, Math.round(bitmap.width * scale));
  const height = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const luma = new Uint8ClampedArray(width * height);
  for (let index = 0; index < luma.length; index += 1) {
    luma[index] = 0.299 * (data[index * 4] ?? 0) + 0.587 * (data[index * 4 + 1] ?? 0) + 0.114 * (data[index * 4 + 2] ?? 0);
  }
  return { width, height, luma };
}

/**
 * The picture for an ad staff place by hand: choose a file, see exactly how the spot will show it, and drag it to choose
 * what shows. The cut happens here, in the browser, so only a small WebP is posted (a server action takes 1 MB); the
 * server cuts it to the exact size again whatever arrives (lib/server/staff-ad-picture.ts).
 */
export function StaffAdPictureField({ state, onChange, onCut, size, spotLabel, invalid, blocked, describedBy, id = "place-picture", hint }: StaffAdPictureFieldProps): ReactElement {
  const previewErrorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // The picture's own size and the part that shows, kept current as the pointer moves faster than React re-renders.
  const sourceSize = useRef<CropSize | null>(null);
  const liveFocal = useRef<Focal>(state.focal);
  // Whether the picture was dragged by hand since it was chosen: the automatic choice then leaves the part that shows alone.
  const moved = useRef(false);
  // The same, for what the page shows (a ref is not read while rendering), and a count that asks the automatic choice to run again.
  const [byHand, setByHand] = useState(false);
  const [refit, setRefit] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const { source, focal, auto } = state;
  useEffect(() => {
    liveFocal.current = focal;
  }, [focal]);

  // Chooses the part that shows by itself when the file, the spot's shape or the automatic setting changes.
  useEffect(() => {
    if (source === null || !auto || moved.current) return;
    let current = true;
    void (async () => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await readBitmap(source);
      } catch {
        return;
      }
      const grid = current ? lumaGridOf(bitmap) : null;
      bitmap.close();
      if (grid === null || !current) return;
      const best = autoFocal(grid, size);
      if (Math.abs(best.x - liveFocal.current.x) > 0.001 || Math.abs(best.y - liveFocal.current.y) > 0.001) {
        liveFocal.current = best;
        onChange({ source, focal: best, auto });
      }
    })();
    return () => {
      current = false;
    };
    // `onChange` is the parent's setter wrapper, new on every render: this runs for a new file, shape or setting only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, size, auto, refit]);

  // Draws the preview and cuts the file to post whenever the file, the part that shows or the spot's shape changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || source === null) return;
    let current = true;
    void (async () => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await readBitmap(source);
      } catch {
        if (current) {
          setProblem("That file could not be read as a picture. Try a JPEG, PNG or WebP.");
          onCut(null);
        }
        return;
      }
      if (!current) return;
      sourceSize.current = { width: bitmap.width, height: bitmap.height };
      if (!bigEnough({ width: bitmap.width, height: bitmap.height }, size)) {
        setProblem(`That picture is small for this spot. Use one at least ${Math.ceil(size.width / 2)} pixels wide.`);
        onCut(null);
        bitmap.close();
        return;
      }
      setProblem(null);
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (context === null) {
        bitmap.close();
        return;
      }
      const rect = coverRect({ width: bitmap.width, height: bitmap.height }, size, focal);
      context.clearRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
      bitmap.close();
      // Automatic: the best quality that keeps the file small. By hand: the one fixed quality, as before.
      const cut = auto ? await encodeWithin(async (quality) => toFile(canvas, quality)) : await toFile(canvas);
      if (current) onCut(cut);
    })();
    return () => {
      current = false;
    };
  }, [source, focal, size, auto, onCut]);

  function startDrag(event: PointerEvent<HTMLCanvasElement>): void {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>): void {
    const start = drag.current;
    const canvas = canvasRef.current;
    const picture = sourceSize.current;
    if (start === null || canvas === null || source === null || picture === null) return;
    const shown = canvas.getBoundingClientRect();
    if (shown.width === 0) return;
    const toCanvas = size.width / shown.width;
    const dx = (event.clientX - start.x) * toCanvas;
    const dy = (event.clientY - start.y) * toCanvas;
    drag.current = { x: event.clientX, y: event.clientY };
    const next = dragFocal(picture, size, liveFocal.current, dx, dy);
    liveFocal.current = next;
    moved.current = true;
    setByHand(true);
    onChange({ source, focal: next, auto });
  }

  function choose(file: File | undefined): void {
    moved.current = false;
    setByHand(false);
    liveFocal.current = CENTRE;
    onChange({ source: file ?? null, focal: CENTRE, auto });
    if (file === undefined) {
      setProblem(null);
      onCut(null);
    }
  }

  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        Picture <span className="text-ink-soft">(optional)</span>
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => choose(event.target.files?.[0])}
        aria-invalid={invalid || problem !== null ? true : undefined}
        aria-describedby={[describedBy, problem === null && !blocked ? undefined : previewErrorId].filter(Boolean).join(" ") || undefined}
        className={`${fieldClasses} file:mr-4 file:rounded-full file:border-0 file:bg-paper-deep file:px-4 file:py-1.5 file:text-sm file:font-medium`}
      />
      <p id={hintId} className={hintClasses}>
        {hint ?? `Shown in ${spotLabel}. Without one the ad uses the category’s own photo. JPEG, PNG or WebP.`}
      </p>
      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => {
            moved.current = false;
            setByHand(false);
            onChange({ source, focal: liveFocal.current, auto: event.target.checked });
          }}
          className="mt-0.5 size-4 accent-[var(--color-accent)]"
        />
        <span>
          Auto-optimize
          <span className="block text-ink-soft">Shows the most detailed part of the picture and keeps the file small. Drag the picture to choose by hand.</span>
        </span>
      </label>
      {problem === null && !blocked ? null : (
        <p id={previewErrorId} role="alert" className="mt-2 border-l-2 border-accent py-0.5 pl-3 text-sm text-accent">
          {problem ?? "The picture isn't ready yet. Wait a moment, or remove it to place the ad without one."}
        </p>
      )}
      {source === null ? null : (
        <div className="mt-3">
          <canvas
            ref={canvasRef}
            aria-label="How the picture will show. Drag it to choose what shows."
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            style={{ aspectRatio: `${String(size.width)} / ${String(size.height)}` }}
            className={`w-56 max-w-full cursor-grab touch-none rounded-control bg-paper-deep active:cursor-grabbing ${problem === null ? "" : "hidden"}`}
          />
          <p className={hintClasses}>Drag the picture to choose what shows.</p>
          {auto && byHand ? (
            <button
              type="button"
              onClick={() => {
                moved.current = false;
                setByHand(false);
                setRefit((count) => count + 1);
              }}
              className="mt-1 mr-4 text-sm text-ink-soft underline-offset-[3px] hover:text-accent hover:underline"
            >
              Auto-fit again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => choose(undefined)}
            className="mt-1 text-sm text-ink-soft underline-offset-[3px] hover:text-accent hover:underline"
          >
            Remove picture
          </button>
        </div>
      )}
    </div>
  );
}
