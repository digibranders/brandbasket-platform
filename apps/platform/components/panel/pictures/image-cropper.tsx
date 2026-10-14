"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import type { DirectoryPictureSlot } from "@fynix/db";
import { minimumPictureSize, PICTURE_SHAPES } from "@fynix/shared/lib/directory/pictures";
import { Button } from "@fynix/shared/ui/panel/button";
import { cropBounds, cropRect, panView, startView, zoomView, type CropBounds, type CropView } from "@/lib/uploads/crop-geometry";
import { cropToBlob, drawCrop, openPhoto } from "@/lib/uploads/crop-image";
import { ENLARGED_NOTE, enlargedNote, largestOf, minimumSizeText, reviewLine, tooSmallText } from "@/lib/uploads/review-text";

/*
 * The crop window: one chosen photo, fitted to each of a picture's shapes in turn. The frame is the slot's own shape
 * and cannot be changed, so whatever comes out fits the layout; the owner only moves the photo under it and zooms.
 * What the frame shows is exactly what is stored. After the last shape the owner sees each finished picture, with its
 * size and the size of the photo they chose, and nothing is uploaded until they press Upload: `onDone` is handed the
 * finished images only then.
 */

export interface CropStep {
  readonly slot: DirectoryPictureSlot;
  /** What this shape is, e.g. "Tall ad card". */
  readonly title: string;
  /** Where it shows, in a few words. */
  readonly where: string;
}

export interface CroppedPicture {
  readonly slot: DirectoryPictureSlot;
  readonly blob: Blob;
}

interface ImageCropperProps {
  readonly file: File;
  /** The shapes to fit the photo to, in order. Never empty. */
  readonly steps: readonly CropStep[];
  readonly onCancel: () => void;
  readonly onDone: (pictures: readonly CroppedPicture[]) => void;
}

type OpenedPhoto =
  | { readonly status: "opening" }
  | { readonly status: "unreadable" }
  | { readonly status: "ready"; readonly bitmap: ImageBitmap };

/** How far one press of an arrow key moves the photo, in screen pixels; Shift moves it further. */
const KEY_STEP = 24;
const KEY_STEP_LARGE = 96;
/** One press of + or -, and one notch of the wheel, as a share of the current zoom. */
const KEY_ZOOM = 1.1;
const WHEEL_ZOOM = 0.002;
/** The frame is drawn at up to this many device pixels per screen pixel: sharper than that is wasted work. */
const MAX_PIXEL_RATIO = 2;

const UNREADABLE_MESSAGE = "We couldn't open that photo. Use a JPEG, PNG or WebP image.";
const ENCODE_FAILED_MESSAGE = "Your browser couldn't prepare this photo. Try a different browser, or another photo.";

type ViewUpdate = (view: CropView) => CropView;

interface CropStageProps {
  readonly photo: ImageBitmap;
  readonly bounds: CropBounds;
  readonly view: CropView;
  readonly hintId: string;
  readonly onChange: (update: ViewUpdate) => void;
}

/** The frame itself: the photo drawn cropped, moved by dragging or the arrow keys and zoomed by pinch, wheel or + and -. */
function CropStage({ photo, bounds, view, hintId, onChange }: CropStageProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { readonly x: number; readonly y: number }>());
  const [frameWidth, setFrameWidth] = useState(0);
  const { shape } = bounds;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    // Fires once on observing, then on every change of the frame's size.
    const observer = new ResizeObserver(() => setFrameWidth(canvas.clientWidth));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || frameWidth === 0) return;
    const width = Math.round(frameWidth * Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    const height = Math.round((width * shape.height) / shape.width);
    // Setting a canvas's size clears it, so it is only set when it has really changed.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawCrop(canvas, photo, cropRect(bounds, view));
  }, [photo, bounds, view, frameWidth, shape]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    // Added by hand because React's own wheel listener is passive and could not stop the page scrolling.
    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      onChange((current) => zoomView(bounds, current, current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM)));
    }
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [bounds, onChange]);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    // Only the main button drags: a right-click opens the browser's menu, which can swallow the release.
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const before = pointers.current.get(event.pointerId);
    if (before === undefined) return;
    // A mouse that moves with no button held has been released somewhere the release never reached this frame.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      pointers.current.delete(event.pointerId);
      return;
    }
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    const width = event.currentTarget.clientWidth;
    const other = [...pointers.current].find(([pointerId]) => pointerId !== event.pointerId)?.[1];
    if (other === undefined) {
      onChange((current) => panView(bounds, current, now.x - before.x, now.y - before.y, width));
      return;
    }
    // Two fingers: the zoom follows the distance between them, and the photo follows the point half way between.
    const was = Math.hypot(before.x - other.x, before.y - other.y);
    const is = Math.hypot(now.x - other.x, now.y - other.y);
    onChange((current) => {
      const zoomed = was > 0 ? zoomView(bounds, current, (current.zoom * is) / was) : current;
      return panView(bounds, zoomed, (now.x - before.x) / 2, (now.y - before.y) / 2, width);
    });
  }

  function handlePointerEnd(event: PointerEvent<HTMLCanvasElement>): void {
    pointers.current.delete(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const width = event.currentTarget.clientWidth;
    // An arrow moves the frame that way over the photo, so the photo slides the other way.
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      onChange((current) => panView(bounds, current, move[0], move[1], width));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onChange((current) => zoomView(bounds, current, current.zoom * KEY_ZOOM));
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      onChange((current) => zoomView(bounds, current, current.zoom / KEY_ZOOM));
    }
  }

  return (
    <canvas
      ref={canvasRef}
      role="application"
      tabIndex={0}
      aria-label="Your photo in the frame. Arrow keys move it, plus and minus zoom."
      aria-describedby={hintId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      style={{
        aspectRatio: `${shape.width} / ${shape.height}`,
        // As wide as the window allows, but never so tall that the buttons under it leave the screen.
        width: `min(100%, calc(min(52vh, 24rem) * ${shape.width / shape.height}))`,
      }}
      className="mx-auto block cursor-grab touch-none select-none rounded-[14px] bg-paper-deep active:cursor-grabbing"
    />
  );
}

export function ImageCropper({ file, steps, onCancel, onDone }: ImageCropperProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const hintId = useId();
  const zoomId = useId();
  const [photo, setPhoto] = useState<OpenedPhoto>({ status: "opening" });
  const [stepIndex, setStepIndex] = useState(0);
  /** The view chosen for each step so far; a step not visited yet starts from the middle of the photo. */
  const [views, setViews] = useState<readonly (CropView | undefined)[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The finished pictures while the owner checks them; null while they are still cropping. */
  const [review, setReview] = useState<readonly CroppedPicture[] | null>(null);
  /** For each finished picture: whether it was made from less of the photo than it has pixels, so it was enlarged. */
  const [enlargedPictures, setEnlargedPictures] = useState<readonly boolean[]>([]);
  /** Addresses for showing the finished pictures; released when the review ends. */
  const reviewUrls = useMemo(() => (review === null ? [] : review.map((picture) => URL.createObjectURL(picture.blob))), [review]);
  useEffect(() => () => reviewUrls.forEach((url) => URL.revokeObjectURL(url)), [reviewUrls]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: ImageBitmap | null = null;
    void openPhoto(file).then((bitmap) => {
      if (cancelled) {
        bitmap?.close();
        return;
      }
      opened = bitmap;
      setPhoto(bitmap === null ? { status: "unreadable" } : { status: "ready", bitmap });
    });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [file]);

  const bitmap = photo.status === "ready" ? photo.bitmap : null;
  /** How the photo may be cropped to each step's shape; null for a step the photo is too small for. */
  const allBounds = useMemo(
    () =>
      bitmap === null
        ? []
        : steps.map((step) =>
            cropBounds({ width: bitmap.width, height: bitmap.height }, PICTURE_SHAPES[step.slot], minimumPictureSize(step.slot)),
          ),
    [bitmap, steps],
  );

  const step = steps[stepIndex];
  const bounds = allBounds[stepIndex] ?? null;
  const tooSmallFor = steps.find((_, index) => allBounds[index] === null);
  const view = bounds === null ? null : (views[stepIndex] ?? startView(bounds));
  const last = stepIndex === steps.length - 1;

  const changeView = useCallback(
    (update: ViewUpdate): void => {
      if (bounds === null) return;
      setViews((current) => {
        const next = [...current];
        next[stepIndex] = update(current[stepIndex] ?? startView(bounds));
        return next;
      });
    },
    [bounds, stepIndex],
  );

  async function finish(): Promise<void> {
    if (bitmap === null) return;
    setPreparing(true);
    setProblem(null);
    const pictures: CroppedPicture[] = [];
    const enlarged: boolean[] = [];
    try {
      for (const [index, each] of steps.entries()) {
        const eachBounds = allBounds[index];
        if (eachBounds === undefined || eachBounds === null) continue;
        const rect = cropRect(eachBounds, views[index] ?? startView(eachBounds));
        const blob = await cropToBlob(bitmap, rect, PICTURE_SHAPES[each.slot]);
        if (blob === null) throw new Error("The browser could not encode the crop");
        pictures.push({ slot: each.slot, blob });
        enlarged.push(enlargedNote({ width: rect.width, height: rect.height }, PICTURE_SHAPES[each.slot]) !== null);
      }
    } catch {
      // Whatever went wrong, the window must not be left locked with its buttons disabled.
      setPreparing(false);
      setProblem(ENCODE_FAILED_MESSAGE);
      return;
    }
    setPreparing(false);
    setEnlargedPictures(enlarged);
    setReview(pictures);
  }

  function next(): void {
    if (last) void finish();
    else setStepIndex(stepIndex + 1);
  }

  const blocked =
    photo.status === "unreadable"
      ? UNREADABLE_MESSAGE
      : bitmap !== null && tooSmallFor !== undefined
        ? tooSmallText({ width: bitmap.width, height: bitmap.height }, minimumPictureSize(tooSmallFor.slot))
        : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!preparing) onCancel();
      }}
      className="m-auto w-[min(calc(100vw-2rem),34rem)] rounded-card bg-card p-0 text-ink shadow-[0_24px_80px_-20px_rgb(42_13_16/0.45)] backdrop:bg-ink/60"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl leading-tight">
            {review !== null && steps.length > 1 ? "Check your pictures" : (step?.title ?? "Your photo")}
          </h2>
          {steps.length > 1 && blocked === null && review === null ? (
            <p className="shrink-0 text-sm tabular-nums text-ink-soft">
              {stepIndex + 1} of {steps.length}
            </p>
          ) : null}
        </div>
        {step === undefined || blocked !== null || (review !== null && steps.length > 1) ? null : (
          <p className="mt-1 text-sm text-ink-soft">{step.where}</p>
        )}

        {blocked !== null ? (
          <p role="alert" className="mt-5 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {blocked}
          </p>
        ) : review !== null && bitmap !== null ? (
          <div className="mt-5 grid gap-5">
            <p className="text-sm text-ink-soft">This is how it will look. It uploads only when you press Upload.</p>
            {review.map((picture, index) => {
              const shape = PICTURE_SHAPES[picture.slot];
              const each = steps.find((candidate) => candidate.slot === picture.slot);
              return (
                <figure key={picture.slot} className="grid gap-2">
                  {steps.length > 1 ? <figcaption className="text-sm font-semibold">{each?.title}</figcaption> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element -- a preview of a file still in this browser. */}
                  <img
                    src={reviewUrls[index]}
                    alt={`Preview: ${each?.title ?? "your photo"}`}
                    width={shape.width}
                    height={shape.height}
                    style={{ width: `min(100%, calc(min(${steps.length > 1 ? "22vh" : "40vh"}, 18rem) * ${shape.width / shape.height}))` }}
                    className="mx-auto block h-auto rounded-[14px] bg-paper-deep"
                  />
                  <p className="text-center text-[0.8125rem] text-ink-soft">
                    {reviewLine(
                      { width: shape.width, height: shape.height, bytes: picture.blob.size },
                      { width: bitmap.width, height: bitmap.height, bytes: file.size },
                    )}
                  </p>
                  {enlargedPictures[index] === true ? (
                    <p role="status" className="text-center text-[0.8125rem] text-accent-deep">
                      {ENLARGED_NOTE}
                    </p>
                  ) : null}
                </figure>
              );
            })}
            <p className="text-[0.8125rem] text-ink-soft">
              Not happy with it? Press Adjust to move or zoom, or choose a bigger photo.{" "}
              {minimumSizeText(largestOf(steps.map((each) => minimumPictureSize(each.slot))))}
            </p>
          </div>
        ) : bitmap === null || bounds === null || view === null ? (
          <p aria-live="polite" className="mt-5 py-16 text-center text-sm text-ink-soft">
            Opening your photo…
          </p>
        ) : (
          <>
            <div className="mt-5">
              {/* A new stage for each step, so the frame takes the new shape and no pointer is carried over. */}
              <CropStage key={stepIndex} photo={bitmap} bounds={bounds} view={view} hintId={hintId} onChange={changeView} />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <label htmlFor={zoomId} className="text-[0.8125rem] text-ink-soft">
                Zoom
              </label>
              <input
                id={zoomId}
                type="range"
                min={1}
                max={bounds.maxZoom}
                step={0.01}
                value={view.zoom}
                disabled={bounds.maxZoom <= 1}
                onChange={(event) => {
                  const zoom = Number(event.target.value);
                  changeView((current) => zoomView(bounds, current, zoom));
                }}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
            <p id={hintId} className="mt-3 text-[0.8125rem] text-ink-soft">
              {bounds.maxZoom <= 1 ? "Drag to move. This photo is too small to zoom in." : "Drag to move. Pinch, scroll or slide to zoom."}{" "}
              {minimumSizeText(minimumPictureSize(step?.slot ?? steps[0]?.slot ?? "listing"))}
            </p>
          </>
        )}

        {problem === null ? null : (
          <p role="alert" className="mt-4 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {problem}
          </p>
        )}

        {/* Stays at the bottom of the window, so Upload is never below the fold on a phone. */}
        <div className="sticky bottom-0 -mx-6 mt-6 -mb-6 flex flex-wrap items-center justify-between gap-3 bg-card px-6 pt-3 pb-6 sm:-mx-7 sm:-mb-7 sm:px-7 sm:pb-7">
          <Button type="button" variant={blocked === null ? "quiet" : "secondary"} size="sm" disabled={preparing} onClick={onCancel}>
            {blocked === null ? "Cancel" : "Choose another photo"}
          </Button>
          {blocked !== null || bitmap === null ? null : review !== null ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setReview(null)}>
                Adjust
              </Button>
              <Button type="button" size="sm" onClick={() => onDone(review)}>
                Upload
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {stepIndex === 0 ? null : (
                <Button type="button" variant="secondary" size="sm" disabled={preparing} onClick={() => setStepIndex(stepIndex - 1)}>
                  Back
                </Button>
              )}
              <Button type="button" size="sm" disabled={preparing} onClick={next}>
                {preparing ? "Preparing…" : last ? "Preview" : "Next"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
