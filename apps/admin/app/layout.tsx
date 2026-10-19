import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { DashboardRoot, dashboardMetadataBase, dashboardViewport } from "@brandbasket/shared/ui/panel/dashboard-root";
import { adminBrand } from "@/lib/brand";
import { figtree } from "@/lib/brandbasket-font";
import "./console.css";

// A root layout (see components/dashboard-root.tsx for why): this app no longer has a single shared
// app/layout.tsx, so metadataBase/applicationName/viewport must be supplied here, same as before the split.
export const metadata: Metadata = {
  ...dashboardMetadataBase,
  title: { default: "Staff console", template: `%s · ${adminBrand().staffLabel}` },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = dashboardViewport;

interface AdminHostLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminHostLayout({ children }: AdminHostLayoutProps): Promise<ReactElement> {
  // Brandbasket's palette and typeface are the shared theme's `html[data-brand="brandbasket"]`, as on the customer dashboard; console.css adds
  // the console's own surfaces (the dock's glass, its buttons) in the same colours.
  return <DashboardRoot brand={{ id: "brandbasket", className: figtree.variable }}>{children}</DashboardRoot>;
}
