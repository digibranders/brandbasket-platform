import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { DashboardRoot, dashboardMetadataBase, dashboardViewport } from "@brandbasket/shared/ui/panel/dashboard-root";
import { adminBrand } from "@/lib/brand";
import { brandbasketFontVariables } from "@/lib/brandbasket-font";
import "./console.css";

// A root layout (see components/dashboard-root.tsx for why): this app no longer has a single shared
// app/layout.tsx, so metadataBase/applicationName/viewport must be supplied here, same as before the split.
export const metadata: Metadata = {
  ...dashboardMetadataBase,
  title: { default: "Staff console", template: `%s · ${adminBrand().staffLabel}` },
  robots: { index: false, follow: false },
};

/** The browser bar takes the page colour (theme.css `--color-bg`). */
export const viewport: Viewport = { ...dashboardViewport, themeColor: "#f6f5f2" };

interface AdminHostLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminHostLayout({ children }: AdminHostLayoutProps): Promise<ReactElement> {
  // The v2 palette and Red Hat type come from theme.css `[data-app="console"]`, the same block the customer dashboard uses.
  return (
    <DashboardRoot brand={{ id: "brandbasket", className: brandbasketFontVariables }} app="console">
      {children}
    </DashboardRoot>
  );
}
