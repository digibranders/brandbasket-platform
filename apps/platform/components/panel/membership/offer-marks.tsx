import type { ReactElement } from "react";
import type { AddOnId } from "@brandbasket/shared/lib/billing/add-ons";

/*
 * The package card's pictures, drawn here so no image file or icon font is needed: each service's own mark. Decorative: hidden
 * from screen readers, the words say the same thing.
 */

/** Each service's own mark inside its soft tile. */
export function AddOnMark({ addOn }: { readonly addOn: AddOnId }): ReactElement {
  switch (addOn) {
    case "managed-website":
      return (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-accent-pale sm:size-12 sm:rounded-[0.9rem]">
          <svg viewBox="0 0 32 32" className="size-7">
            <rect x="4.5" y="7" width="23" height="18" rx="3" fill="none" className="stroke-accent" strokeWidth="2.4" />
            <path d="M4.5 12.5h23" className="stroke-accent" strokeWidth="2.4" />
            <rect x="9" y="16.5" width="8" height="5" rx="1.2" className="fill-accent/60" />
          </svg>
        </span>
      );
    case "digital-growth":
      return (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-[#e1f0e3] sm:size-12 sm:rounded-[0.9rem]">
          <svg viewBox="0 0 32 32" className="size-7">
            <path d="M5 13.5h5.5l10-5.5v16l-10-5.5H5z" fill="#3c8f5a" />
            <path d="M10.5 19l1.8 6.2h3.2L14 20z" fill="#2f7a4a" />
            <g fill="none" stroke="#3c8f5a" strokeWidth="2" strokeLinecap="round">
              <path d="M24.5 11.5l2.4-1.6" />
              <path d="M25 16h3" />
              <path d="M24.5 20.5l2.4 1.6" />
            </g>
          </svg>
        </span>
      );
    case "local-seo-aeo":
      return (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-[#e6ecf5] sm:size-12 sm:rounded-[0.9rem]">
          <svg viewBox="0 0 32 32" className="size-7">
            <circle cx="14" cy="14" r="8" fill="none" stroke="#2f6db5" strokeWidth="3" />
            <path d="M20 20l7 7" stroke="#2f6db5" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M14 10.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z" fill="#4a86c8" />
          </svg>
        </span>
      );
    default: {
      const unhandled: never = addOn;
      throw new Error(`Unhandled add-on ${String(unhandled)}`);
    }
  }
}
