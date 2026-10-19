import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "../lib/cn";

/** The logo to draw: one image for dark surfaces, one for light. */
export interface BrandLogo {
  readonly name: string;
  /** Where the product's own website is, for the sign-in screens' way back to it. */
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
  /** The logo to draw. */
  readonly brand: BrandLogo;
  /** Where the logo links to: sign-in screens point it at the marketing site. */
  readonly href: string;
  /** "accent" (default): the logo for light surfaces. "light": white, over a photo or a dark surface. */
  readonly tone?: "accent" | "light";
}

/** The Brandbasket logo, as the sign-in screens and the dashboard's sidebar draw it. */
export function WordmarkLogo({ className, href, tone = "accent", brand }: WordmarkLogoProps): ReactElement {
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
