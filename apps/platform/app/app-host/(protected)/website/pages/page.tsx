import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageColumns, PageSection } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getLiveWebsite } from "@/lib/server/onboarding";
import { PRODUCT_ROWS } from "@/lib/website/pages-map";
import { askAboutHref } from "@/lib/website/tabs";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";

export const metadata: Metadata = { title: "Website pages" };

/**
 * What is real about the website's pages and where each part is changed. We keep no list of a site's pages, so none is shown as
 * if we did: the live website is linked, and a change to any page is asked for by naming it. The product rows point at the
 * pages of the dashboard that change the rest.
 */
export default async function WebsitePagesPage(): Promise<ReactElement> {
  await requireWebsiteClient();
  const live = await getLiveWebsite();
  const siteHref = live === null ? null : safeExternalHref(`https://${live.hostname}`);

  return (
    <PageColumns
      main={
        <PageSection id="site-pages" title="Your website" flush>
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              {live !== null && siteHref !== null ? (
                <p className="text-[0.9375rem] font-semibold text-ink">
                  <a href={siteHref} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-[3px]">
                    {live.hostname}
                  </a>
                </p>
              ) : (
                <p className="text-[0.9375rem] font-semibold text-ink">Not live yet</p>
              )}
              <p className="mt-0.5 text-[0.875rem] text-ink-2">
                {live === null ? "Your pages appear here to visit once your website is live." : "To change a page, tell us which one and what to change."}
              </p>
            </div>
            <Link href={askAboutHref("")} className={SOFT_BUTTON}>
              Ask for a change
            </Link>
          </div>
        </PageSection>
      }
      aside={
        <PageSection id="changed-here" title="Changed in your dashboard" flush>
          <ul className="divide-y divide-line">
            {PRODUCT_ROWS.map((row) => (
              <li key={row.label} className="py-4">
                <Link href={row.href} className="text-[0.9375rem] font-semibold text-ink underline underline-offset-[3px]">
                  {row.label}
                </Link>
                <p className="mt-0.5 text-[0.8125rem] text-ink-2">{row.line}</p>
              </li>
            ))}
          </ul>
        </PageSection>
      }
    />
  );
}
