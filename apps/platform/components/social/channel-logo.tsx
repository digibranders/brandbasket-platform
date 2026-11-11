import { useId, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";

/**
 * The networks' logos, drawn the way the team's dashboard in social-auto draws them (dashboard/web/ui.ts): Facebook's blue circle
 * with its white "f", Instagram's gradient square with its white camera outline, LinkedIn's blue square with its white "in", and Google's
 * shop front.
 * Brand marks in each network's own colours, so they are the one place outside the palette: a logo is not ours to recolour.
 */

const FACEBOOK_F = "M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.4V21h3.1z";
const LINKEDIN_PATHS = [
  "M6.9 9.5h2.6V18H6.9z",
  "M8.2 5.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  "M11 9.5h2.5v1.2c.4-.7 1.3-1.4 2.7-1.4 2.7 0 3.2 1.8 3.2 4.1V18h-2.6v-4.1c0-1 0-2.2-1.4-2.2s-1.6 1.1-1.6 2.2V18H11z",
] as const;
/** Instagram's gradient, from the bottom left corner to the top right. */
const INSTAGRAM_STOPS = [
  ["0", "#feda75"],
  ["0.25", "#fa7e1e"],
  ["0.5", "#d62976"],
  ["0.75", "#962fbf"],
  ["1", "#4f5bd5"],
] as const;

/** Google Business: a shop front with a four-panel awning and a white G (100 by 87), as the dashboard draws it. */
const GOOGLE_BODY = "M6.7 30h86.7v50.6a6.4 6.4 0 0 1-6.4 6.4H13.1a6.4 6.4 0 0 1-6.4-6.4z";
const GOOGLE_PANELS = [
  ["M0 32.2L6.5 5.5Q8 0 13.5 0H28.9L25 32.2z", "#7aabf7", "M0 32.2a12.5 12.5 0 0 0 25 0z", "#74a0e1"],
  ["M28.9 0H50V32.2H25z", "#4355b2", "M25 32.2a12.5 12.5 0 0 0 25 0z", "#3e4fa7"],
  ["M50 0H71.1L75 32.2H50z", "#7aabf7", "M50 32.2a12.5 12.5 0 0 0 25 0z", "#74a0e1"],
  ["M71.1 0H86.5Q92 0 93.5 5.5L100 32.2H75z", "#4355b2", "M75 32.2a12.5 12.5 0 0 0 25 0z", "#3e4fa7"],
] as const;

function GoogleMark({ id }: { readonly id: string }): ReactElement {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d69ea" />
          <stop offset="1" stopColor="#4684f1" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={GOOGLE_BODY} />
        </clipPath>
      </defs>
      <path d={GOOGLE_BODY} fill={`url(#${id}-body)`} />
      <path d="M6.7 43.5L50 87H6.7z" fill="#4d8bf3" clipPath={`url(#${id}-clip)`} />
      {GOOGLE_PANELS.map(([panel, color, scallop, shade]) => (
        <g key={panel}>
          <path d={panel} fill={color} />
          <path d={scallop} fill={shade} />
        </g>
      ))}
      <path d="M81.54 61.11A10.1 10.1 0 1 0 83.9 67.6" fill="none" stroke="#fff" strokeWidth="5.1" />
      <path d="M74.1 67.6H86.2" fill="none" stroke="#fff" strokeWidth="4.9" />
    </>
  );
}

function Mark({ platform, gradientId }: { readonly platform: ChannelPlatform; readonly gradientId: string }): ReactElement {
  if (platform === "google") return <GoogleMark id={gradientId} />;
  if (platform === "facebook") {
    return (
      <>
        <circle cx="12" cy="12" r="12" fill="#1877f2" />
        <path d={FACEBOOK_F} fill="#fff" />
      </>
    );
  }
  if (platform === "instagram") {
    return (
      <>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            {INSTAGRAM_STOPS.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
        <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="16.4" cy="7.6" r="1" fill="#fff" />
      </>
    );
  }
  return (
    <>
      <rect x="0" y="0" width="24" height="24" rx="5" fill="#0a66c2" />
      {LINKEDIN_PATHS.map((d) => (
        <path key={d} d={d} fill="#fff" />
      ))}
    </>
  );
}

/** A network's logo. `small` is the size beside a line of text, `medium` the size of a row in a list; `dim` greys it out for a network that is off. */
export function ChannelLogo({ platform, small = false, medium = false, dim = false, className }: { readonly platform: ChannelPlatform; readonly small?: boolean; readonly medium?: boolean; readonly dim?: boolean; readonly className?: string }): ReactElement {
  // Each Instagram and Google logo on the page needs its own gradient id, or they would all point at the first one's.
  const gradientId = `ig-${useId().replace(/:/g, "")}`;
  return (
    <svg role="img" aria-label={PLATFORM_NAMES[platform]} viewBox={platform === "google" ? "0 0 100 87" : "0 0 24 24"} className={cn("shrink-0", small ? "size-5" : medium ? "size-7" : "size-9", dim && "opacity-45 grayscale", className)}>
      <Mark platform={platform} gradientId={gradientId} />
    </svg>
  );
}
