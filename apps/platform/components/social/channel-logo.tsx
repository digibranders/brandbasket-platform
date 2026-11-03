import { useId, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";

/**
 * The networks' logos, drawn the way the team's dashboard in social-auto draws them (dashboard/web/ui.ts): Facebook's blue circle
 * with its white "f", Instagram's gradient square with its white camera outline, LinkedIn's blue square with its white "in".
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

function Mark({ platform, gradientId }: { readonly platform: ChannelPlatform; readonly gradientId: string }): ReactElement {
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

/** A network's logo. `small` is the size beside a line of text; `dim` greys it out for a network that is off. */
export function ChannelLogo({ platform, small = false, dim = false }: { readonly platform: ChannelPlatform; readonly small?: boolean; readonly dim?: boolean }): ReactElement {
  // Each Instagram logo on the page needs its own gradient id, or they would all point at the first one's.
  const gradientId = `ig-${useId().replace(/:/g, "")}`;
  return (
    <svg role="img" aria-label={PLATFORM_NAMES[platform]} viewBox="0 0 24 24" className={cn("shrink-0", small ? "size-5" : "size-9", dim && "opacity-45 grayscale")}>
      <Mark platform={platform} gradientId={gradientId} />
    </svg>
  );
}
