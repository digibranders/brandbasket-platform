"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { BrandLogo } from "@fynix/shared/ui/logo";

interface BrandAboutProps {
  readonly brand: BrandLogo;
  /** What the product is, in a sentence or two, said when the logo is pressed. */
  readonly about: string;
}

/**
 * The logo on the checkout page. It goes nowhere, so a customer in the middle of paying is never taken off the page: pressed,
 * it opens a small note on what the product is, and closes again on a second press, a press elsewhere or Escape.
 */
export function BrandAbout({ brand, about }: BrandAboutProps): ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent): void {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={noteId}
        aria-label={`About ${brand.name}`}
        className="inline-flex cursor-pointer items-center rounded-md py-1"
      >
        {/* A plain img: the file is an SVG, which next/image would only pass through. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.dark} alt="" width={brand.width} height={brand.height} className="h-7 w-auto sm:h-8" />
      </button>
      {open ? (
        <div
          id={noteId}
          role="note"
          className="absolute left-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-card p-4 text-sm leading-relaxed text-ink-soft shadow-[0_18px_40px_-24px_rgb(12_30_46/0.45)] sm:w-72"
        >
          <p className="font-semibold text-ink">{brand.name}</p>
          <p className="mt-1">{about}</p>
        </div>
      ) : null}
    </div>
  );
}
