import type { ReactElement } from "react";
import type { AddOnId } from "@brandbasket/shared/lib/billing/add-ons";

/*
 * The offer card's pictures, drawn here so no image file or icon font is needed: each add-on's own mark. Decorative: hidden
 * from screen readers, the words say the same thing.
 */

/** Each add-on's own mark inside its soft tile. */
export function AddOnMark({ addOn }: { readonly addOn: AddOnId }): ReactElement {
  switch (addOn) {
    case "social-media":
      return (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-[#fde4e1] sm:size-12 sm:rounded-[0.9rem]">
          <svg viewBox="0 0 32 32" className="size-7">
            <defs>
              <linearGradient id="offer-mark-gradient" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#f58529" />
                <stop offset="0.5" stopColor="#dd2a7b" />
                <stop offset="1" stopColor="#8134af" />
              </linearGradient>
            </defs>
            <rect x="3" y="3" width="26" height="26" rx="8" fill="none" stroke="url(#offer-mark-gradient)" strokeWidth="3" />
            <circle cx="16" cy="16" r="5.4" fill="none" stroke="url(#offer-mark-gradient)" strokeWidth="3" />
            <circle cx="23" cy="9" r="1.6" fill="#dd2a7b" />
          </svg>
        </span>
      );
    case "lead-generation":
      return (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-[#e6ecf5] sm:size-12 sm:rounded-[0.9rem]">
          <svg viewBox="0 0 32 32" className="size-7">
            <rect x="4" y="16" width="6.5" height="12" rx="1.6" fill="#4a86c8" />
            <rect x="12.7" y="8" width="6.5" height="20" rx="1.6" fill="#2f6db5" />
            <rect x="21.5" y="13" width="6.5" height="15" rx="1.6" fill="#4a86c8" />
          </svg>
        </span>
      );
    case "advertising":
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
    default: {
      const unhandled: never = addOn;
      throw new Error(`Unhandled add-on ${String(unhandled)}`);
    }
  }
}
