import Link from "next/link";
import type { CSSProperties, ReactElement } from "react";
import { cn } from "../lib/cn";
import { FirstfoldWordmark } from "./firstfold-wordmark";
import { createLogoMarkPaths } from "../lib/logo-mark";

const MARK_VIEWBOX_SIZE = 100;
const MARK_PATHS = createLogoMarkPaths({ rings: 5, size: MARK_VIEWBOX_SIZE });

/** On hover the rings twist like contour lines turning towards a summit: the innermost turns most. */
const RING_TWIST_DEG = 6;
/** Each ring starts a beat after the one inside it, so the motion ripples outwards. */
const RING_STAGGER_MS = 45;

function ringStyle(index: number): CSSProperties {
  const ringsOutside = MARK_PATHS.length - 1 - index;
  return {
    "--ring-turn": `${ringsOutside * RING_TWIST_DEG}deg`,
    "--ring-delay": `${index * RING_STAGGER_MS}ms`,
  } as CSSProperties;
}

interface LogoMarkProps {
  readonly className?: string;
  /** Stroke width in screen pixels, so the rings stay crisp at any rendered size. */
  readonly strokeWidth?: number;
}

/** Place inside an element with the `group` class to enable the hover and focus twist. */
export function LogoMark({ className, strokeWidth = 1.25 }: LogoMarkProps): ReactElement {
  return (
    <svg
      viewBox={`0 0 ${MARK_VIEWBOX_SIZE} ${MARK_VIEWBOX_SIZE}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
    >
      {MARK_PATHS.map((d, index) => (
        <path
          key={d}
          d={d}
          vectorEffect="non-scaling-stroke"
          style={ringStyle(index)}
          className="origin-center transition-[rotate] delay-(--ring-delay) duration-700 ease-calm [transform-box:view-box] motion-safe:group-hover:rotate-(--ring-turn) motion-safe:group-focus-visible:rotate-(--ring-turn)"
        />
      ))}
    </svg>
  );
}

interface LogoProps {
  readonly className?: string;
  /**
   * "tile" (default) sets the mark on a white disc, which is what carries it on cream surfaces. "bare" drops the
   * disc and draws the rings in the inherited colour — for dark surfaces, where a white disc would be a hole.
   */
  readonly variant?: "tile" | "bare";
  /** Where the logo links to. Defaults to this surface's home; sign-in screens point it at the marketing site. */
  readonly href?: string;
}

/** Compact lockup for the navigation pill: the mark beside the wordmark. */
export function Logo({ className, variant = "tile", href = "/" }: LogoProps): ReactElement {
  const tiled = variant === "tile";
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 rounded-full pr-2", className)}>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          tiled && "bg-white text-dark-surface",
        )}
      >
        {/* Without the disc the mark has no ring of padding to sit in, so it grows to keep the lockup's weight. */}
        <LogoMark className={tiled ? "size-7" : "size-9"} strokeWidth={tiled ? 1.1 : 1.25} />
      </span>
      <span className="font-brand text-[1.2rem] font-medium leading-none tracking-[-0.015em]">Firstfold</span>
    </Link>
  );
}

/** Another company's wordmark, to draw in place of Firstfold's: one image for dark surfaces, one for light. */
export interface BrandLogo {
  readonly name: string;
  /** Where the brand's own website is, for the sign-in screens' way back to it. */
  readonly siteUrl?: string;
  /** Where mail for help and feedback goes, when it is not the site's own address. */
  readonly email?: string;
  readonly white: string;
  readonly dark: string;
  readonly width: number;
  readonly height: number;
}

interface WordmarkLogoProps {
  readonly className?: string;
  /** Draws this logo instead of the Firstfold wordmark (the dashboard sold under another brand). Omitted: Firstfold's. */
  readonly brand?: BrandLogo;
  /** Where the logo links to: sign-in screens point it at the marketing site. */
  readonly href: string;
  /** "accent" (default): brand burgundy on cream. "light": white, over a photo or a dark surface. */
  readonly tone?: "accent" | "light";
}

/**
 * The full Firstfold wordmark, rings for the "o": the same lettering as the website's header, on the sign-in screens
 * and in the customer dashboard's sidebar.
 */
export function WordmarkLogo({ className, href, tone = "accent", brand }: WordmarkLogoProps): ReactElement {
  if (brand !== undefined) {
    return (
      <Link href={href} aria-label={brand.name} className={cn("inline-flex items-center rounded-md py-1", className)}>
        {/* A plain img: the file is an SVG, which next/image would only pass through. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tone === "light" ? brand.white : brand.dark}
          alt=""
          width={brand.width}
          height={brand.height}
          className="h-7 w-auto sm:h-8"
        />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-label="Firstfold"
      className={cn("inline-flex items-center rounded-md py-1", tone === "light" ? "text-white" : "text-accent", className)}
    >
      <FirstfoldWordmark title="" className="h-7 w-auto sm:h-8" />
    </Link>
  );
}
