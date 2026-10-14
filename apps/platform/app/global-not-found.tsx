import type { Metadata } from "next";
import type { ReactElement } from "react";
import { DashboardRoot } from "@firstfold/shared/ui/panel/dashboard-root";
import { PanelNotFound } from "@firstfold/shared/ui/panel/panel-not-found";
import { logoOf } from "@/lib/brand";
import { figtree } from "@/lib/fynix-font";
import { requestBrand } from "@/lib/server/request-brand";

/**
 * Next's mechanism for a 404 outside every root layout (still experimental in 16.3.5 — see next.config.ts's
 * `globalNotFound` flag). This app has three root layouts since Task 1's Payload migration split the old shared
 * app/layout.tsx (app-host, admin-host, (payload) — see components/dashboard-root.tsx), so a plain top-level
 * app/not-found.tsx can no longer reliably compose a shell: Next has no single layout to pick from.
 *
 * In practice this file is rarely hit — proxy.ts already 404s any unrecognised host, and app-host/admin-host each
 * have their own [...missing] catch-all page for genuinely unmatched paths on a *recognised* host (see those
 * files' own not-found.tsx for why they render directly rather than calling next/navigation's `notFound()`). This
 * one only catches a path that bypasses proxy.ts's matcher entirely (e.g. an extension it treats as a static
 * asset) and matches no real route at all.
 *
 * The title and logo are the brand the request's host is sold under (Fynix Digital on its own host).
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await requestBrand();
  return {
    title: `Not found · ${brand.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function GlobalNotFound(): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <DashboardRoot brand={brand.id === "fynix" ? { id: brand.id, className: figtree.variable } : undefined}>
      <PanelNotFound brand={logoOf(brand)} />
    </DashboardRoot>
  );
}
