"use client";

import Image from "next/image";
import { useId, useRef, type ReactElement } from "react";
import { useBrand } from "@/components/panel/brand-provider";

import { WHERE_IT_SHOWS_LABELS, WHERE_IT_SHOWS_PAGE, spotBox, type WhereItShowsSpot } from "@/lib/where-it-shows";

interface WhereItShowsProps {
  readonly spot: WhereItShowsSpot;
  /** The one line above the picture, e.g. "Your services show as cards in the Services section of your page." */
  readonly caption: string;
}

/** How far above the spot the picture scrolls to, so a little of the page shows around it. */
const SCROLL_MARGIN_PX = 90;

/**
 * A small text link that opens a real screenshot of a business page with the spot this input controls lit up and the
 * rest of the page dimmed, so an owner sees where what they type or upload will appear. The picture is the whole page,
 * scrolled to the spot. Uses the browser's own dialog: Escape closes it and focus returns to the link.
 */
export function WhereItShows({ spot, caption }: WhereItShowsProps): ReactElement | null {
  const brand = useBrand();
  // The screenshot is a business page on Fynix Digital's directory: a brand that does not run the directory has nothing to show.
  if (!brand.showsListing) return null;
  return <WhereItShowsDialog spot={spot} caption={caption} />;
}

function WhereItShowsDialog({ spot, caption }: WhereItShowsProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const box = spotBox(spot);

  function open(): void {
    dialogRef.current?.showModal();
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    // The dialog has to be laid out before the picture's height is known.
    requestAnimationFrame(() => {
      scroller.scrollTop = Math.max(box.y * scroller.scrollHeight - SCROLL_MARGIN_PX, 0);
    });
  }

  return (
    <>
      <button type="button" className="text-xs font-semibold text-accent underline-offset-4 hover:underline" onClick={open}>
        See where this shows
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={captionId}
        className="m-auto w-[min(94vw,52rem)] rounded-2xl border border-line bg-paper p-0 text-ink backdrop:bg-ink/40"
        onClick={(event) => {
          // A click on the backdrop lands on the dialog itself, not on anything inside it.
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <p id={captionId} className="text-sm font-semibold">
            {caption}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-ink-soft transition-colors duration-300 ease-calm hover:text-accent"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
        <div className="px-5 pb-5">
          <div ref={scrollerRef} className="relative max-h-[68vh] overflow-y-auto rounded-xl border border-line bg-white">
            <div className="relative">
              <Image
                src={WHERE_IT_SHOWS_PAGE.src}
                width={WHERE_IT_SHOWS_PAGE.width}
                height={WHERE_IT_SHOWS_PAGE.height}
                alt={`A business page on Fynix, with the part for ${WHERE_IT_SHOWS_LABELS[spot].toLowerCase()} lit up`}
                sizes="52rem"
                unoptimized
                className="block h-auto w-full"
              />
              {/* The spotlight: a border round the spot, and a huge shadow that dims everything outside it. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute rounded-xl border-[3px] border-accent shadow-[0_0_0_100vmax_rgba(26,10,16,0.5)]"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              >
                <span className="absolute -top-3.5 left-4 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white shadow-md">
                  {WHERE_IT_SHOWS_LABELS[spot]} show here
                </span>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
