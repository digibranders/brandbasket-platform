import type { ReactElement } from "react";
import type { AddOnId } from "@fynix/shared/lib/billing/add-ons";

/*
 * The offer card's pictures, drawn here so no image file or icon font is needed. The three platform badges at the top of the
 * card and each add-on's own mark. Decorative: every one is hidden from screen readers, the words say the same thing.
 */

const INSTAGRAM_GRADIENT = "offer-instagram-gradient";

function CameraGlyph({ className, stroke }: { readonly className?: string; readonly stroke: string }): ReactElement {
  return (
    <g className={className} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
      <rect x="6" y="6" width="20" height="20" rx="6" />
      <circle cx="16" cy="16" r="4.6" />
      <circle cx="21.6" cy="10.4" r="0.9" fill={stroke} stroke="none" />
    </g>
  );
}

/** The Instagram badge: a gradient tile with the camera outline. */
function InstagramTile(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" className="size-full">
      <defs>
        <linearGradient id={INSTAGRAM_GRADIENT} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f58529" />
          <stop offset="0.5" stopColor="#dd2a7b" />
          <stop offset="1" stopColor="#8134af" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${INSTAGRAM_GRADIENT})`} />
      <CameraGlyph stroke="#fff" />
    </svg>
  );
}

function LinkedInTile(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" className="size-full">
      <rect width="32" height="32" rx="8" fill="#0a66c2" />
      <rect x="7" y="13" width="3.6" height="12" rx="0.6" fill="#fff" />
      <circle cx="8.8" cy="8.9" r="2.2" fill="#fff" />
      <path d="M14 13h3.4v1.7c.6-1.1 2-2 3.8-2 3.2 0 4.2 2 4.2 5V25h-3.6v-6.2c0-1.5-.4-2.6-1.9-2.6s-2.3 1.1-2.3 2.6V25H14z" fill="#fff" />
    </svg>
  );
}

function YouTubeTile(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" className="size-full">
      <rect width="32" height="32" rx="8" fill="#fff" />
      <rect x="5" y="8.5" width="22" height="15" rx="5" fill="#e0342b" />
      <path d="M13.6 12.6v6.8l6-3.4z" fill="#fff" />
    </svg>
  );
}

/** The three platform badges, tilted and overlapping at the card's top right. */
export function PlatformBadges({ className }: { readonly className?: string }): ReactElement {
  return (
    <div aria-hidden="true" className={className}>
      <div className="relative size-full">
        <div className="absolute right-4 top-0 size-[4.5rem] -rotate-6 rounded-[1.1rem] shadow-[0_10px_22px_-8px_rgb(60_40_10/0.4)]">
          <InstagramTile />
        </div>
        <div className="absolute right-0 top-[3.4rem] size-14 rotate-6 rounded-[1rem] shadow-[0_10px_22px_-8px_rgb(60_40_10/0.4)]">
          <LinkedInTile />
        </div>
        <div className="absolute right-[4.6rem] top-[3.9rem] size-14 -rotate-3 rounded-[1rem] shadow-[0_10px_22px_-8px_rgb(60_40_10/0.35)]">
          <YouTubeTile />
        </div>
      </div>
    </div>
  );
}

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
