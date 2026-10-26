import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { DashboardRoot, dashboardMetadataBase, dashboardViewport } from "@brandbasket/shared/ui/panel/dashboard-root";
import { BrandProvider } from "@/components/panel/brand-provider";
import { brandbasketFontVariables } from "@/lib/brandbasket-font";
import { requestBrand } from "@/lib/server/request-brand";
import { requireSurfaceHost } from "@/lib/server/surface-host";
import { SupportProvider } from "@/components/panel/support/support-provider";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { getSessionUser } from "@/lib/server/session";

// A root layout (see components/dashboard-root.tsx for why): this app no longer has a single shared
// app/layout.tsx, so metadataBase/applicationName/viewport must be supplied here, same as before the split.
// A function, not a constant, because the title carries the name of the brand the host is sold under (Brandbasket on
// its own host).
export async function generateMetadata(): Promise<Metadata> {
  const brand = await requestBrand();
  return {
    ...dashboardMetadataBase,
    title: { default: "Your dashboard", template: `%s · ${brand.name}` },
    robots: { index: false, follow: false },
  };
}

/** The browser bar takes the page colour (theme.css `--color-bg`). */
export const viewport: Viewport = { ...dashboardViewport, themeColor: "#f6f5f2" };

interface AppHostLayoutProps {
  readonly children: ReactNode;
}

export default async function AppHostLayout({ children }: AppHostLayoutProps): Promise<ReactElement> {
  await requireSurfaceHost("app");
  const brand = await requestBrand();
  const userId = process.env.BRANDBASKET_SUPPORT_MODE === "internal" ? (await getSessionUser())?.id ?? null : null;
  return <DashboardRoot brand={{ id: "brandbasket", className: brandbasketFontVariables }} app="customer"><BrandProvider brand={brand}><SupportProvider canCreate={canCreateSupportRequest(userId)}>{children}</SupportProvider></BrandProvider></DashboardRoot>;
}
