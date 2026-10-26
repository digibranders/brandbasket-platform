import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Inter, Newsreader, Outfit } from "next/font/google";
import type { ReactElement, ReactNode } from "react";
import { siteConfig } from "../../lib/site-config";
import "../../styles/globals.css";

/**
 * Shared document shell for the two dashboard hosts (app-host, admin-host), each its own root layout — see
 * docs/superpowers/plans/2026-09-17-payload-cms-migration.md Task 1. Extracted here, out of a single shared
 * app/layout.tsx, because Payload's admin panel needs to be a root layout of its own too (it renders its own
 * <html>/<body> — see payload.config.ts's neighbours under app/(payload)/), and Next.js only allows a route
 * segment to be a root layout when there is no layout.tsx above it. Both dashboard layouts must stay visually and
 * behaviourally identical to what the single shared root layout produced before this split: same fonts, same
 * `lang`/`className`, same body classes, same metadataBase/applicationName/viewport.
 */

/** Headlines, in upright and italic. */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

/** Body text, forms, buttons and labels. */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/** The customer dashboard's one typeface, inside the app (the `dashboard-type` utility in styles/theme.css). */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Brand wordmark only. */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

/** Spread into each dashboard root layout's own `metadata` export, alongside its surface-specific title/robots. */
export const dashboardMetadataBase: Pick<Metadata, "metadataBase" | "applicationName"> = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
};

export const dashboardViewport: Viewport = {
  themeColor: "#f6efe6",
};

interface DashboardRootProps {
  readonly children: ReactNode;
  /**
   * A brand whose look replaces Brandbasket's (packages/shared/src/styles/theme.css, `html[data-brand]`). `className` carries
   * that brand's own font variable. Omitted: the document is exactly Brandbasket's.
   */
  readonly brand?: { readonly id: string; readonly className: string };
  /** Which app this document is, for styles only one app takes (theme.css `[data-app="customer"]`). The console leaves it off. */
  readonly app?: "customer";
}

/** The `<html>`/`<body>` shell every dashboard root layout renders. */
export function DashboardRoot({ children, brand, app }: DashboardRootProps): ReactElement {
  const fonts = `${newsreader.variable} ${hankenGrotesk.variable} ${inter.variable} ${outfit.variable}`;
  return (
    <html lang="en" className={brand === undefined ? fonts : `${fonts} ${brand.className}`} data-brand={brand?.id} data-app={app}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
