import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageColumns, PageSection } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getLiveWebsite } from "@/lib/server/onboarding";
import { PRODUCT_ROWS, SITE_PAGES } from "@/lib/website/pages-map";
import { askAboutHref } from "@/lib/website/tabs";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";

export const metadata: Metadata = { title: "Website pages" };

/** The map of what the site shows and where each part is changed. Pages are changed by Ask for a change; the product rows point at their own pages. */
export default async function WebsitePagesPage(): Promise<ReactElement> {
  await requireWebsiteClient();
  const live = await getLiveWebsite();

  const siteHref = (path: string): string | null => (live === null ? null : safeExternalHref(`https://${live.hostname}${path}`));

  return (
    <PageColumns
      main={
        <PageSection id="site-pages" title="Pages on your website" flush>
          <ul className="divide-y divide-line">
            {SITE_PAGES.map((page) => {
              const href = siteHref(page.path);
              return (
                <li key={page.name} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {href === null ? (
                        page.name
                      ) : (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px]">
                          {page.name}
                        </a>
                      )}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-ink-2">{page.line}</p>
                  </div>
                  <Link href={askAboutHref(page.name)} className={SOFT_BUTTON}>
                    Change<span className="sr-only"> {page.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </PageSection>
      }
      aside={
        <PageSection id="changed-here" title="Changed in your dashboard" flush>
          <ul className="divide-y divide-line">
            {PRODUCT_ROWS.map((row) => (
              <li key={row.label} className="py-4">
                <Link href={row.href} className="text-sm font-semibold text-ink underline underline-offset-[3px]">
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
