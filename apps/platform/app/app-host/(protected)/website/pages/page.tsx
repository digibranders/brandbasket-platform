import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
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
    <div className="grid w-full max-w-[44rem] gap-8">
      <h1 className="sr-only">Pages</h1>

      <ul className="divide-y divide-line border-y border-line">
        {SITE_PAGES.map((page) => {
          const href = siteHref(page.path);
          return (
            <li key={page.name} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {href === null ? (
                    page.name
                  ) : (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="link-underline">
                      {page.name}
                    </a>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">{page.line}</p>
              </div>
              <Link href={askAboutHref(page.name)} className="link-underline shrink-0 text-sm font-medium text-ink">
                Change
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="divide-y divide-line border-y border-line">
        {PRODUCT_ROWS.map((row) => (
          <li key={row.label} className="py-4">
            <Link href={row.href} className="link-underline font-medium text-ink">
              {row.label}
            </Link>
            <p className="mt-0.5 text-sm text-ink-soft">{row.line}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
