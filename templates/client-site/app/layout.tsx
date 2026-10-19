import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Maintenance } from "@/components/maintenance";
import { brandbasketGet } from "@/lib/brandbasket";

/**
 * Optional, set in the site's hosting. When the plan has ended the platform sends no business details, so the notice
 * takes the name from here: SITE_BUSINESS_NAME.
 */
function maintenanceProps(): { businessName?: string } {
  const name = process.env.SITE_BUSINESS_NAME?.trim();
  return name ? { businessName: name } : {};
}

/** The platform's /api/site/info answer; copy the full shape from the platform's lib/site-info.ts when the site uses more of it. */
interface SiteInfo {
  readonly business: string;
}

/**
 * The layout wraps every page, so one check here takes the whole site down: while the plan has ended, no page, header
 * or link is shown, only the maintenance notice. `noindex` keeps search engines from remembering the notice as the site.
 */
export async function generateMetadata(): Promise<Metadata> {
  const info = await brandbasketGet<SiteInfo>("/api/site/info");
  return info.kind === "offline" ? { title: "Under maintenance", robots: { index: false, follow: false } } : {};
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const info = await brandbasketGet<SiteInfo>("/api/site/info");
  return (
    <html lang="en">
      <body>{info.kind === "offline" ? <Maintenance {...maintenanceProps()} /> : children}</body>
    </html>
  );
}
