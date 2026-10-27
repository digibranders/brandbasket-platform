import { FileText, ListChecks, MagnifyingGlass, MapPin, ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { DARK_BUTTON, LIFT, SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns, PageFrame, PageSection } from "@/components/v2/page";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import type { SearchData } from "@/lib/server/search";
import { dueLabel } from "@/lib/social/week";
import { todoItemHref, type TodoItem } from "@/lib/todo";

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 last:border-b-0";
const EXTERNAL_LINK = "underline underline-offset-[3px]";

/** A website item opens its page; a Social or Search item opens its form on the To do page (as Overview does). */
const itemHref = (item: TodoItem): string => (item.kind === "link" ? item.href : todoItemHref(item.key));

/** Staff type these addresses in; only a real https address becomes a link. */
function httpsUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** The Search page: what waits on the customer, the figure, the pages and listings finished this month. */
export function SearchView({ data }: { readonly data: SearchData }): ReactElement {
  const { summary, waiting, report, month } = data;
  const reportUrl = httpsUrl(report);
  const nothingYet = waiting.length === 0 && summary.pageOne === null && summary.pages.length === 0 && summary.listings.length === 0;
  return (
    <PageFrame
      title="Search"
      lede={
        summary.pageOne === null
          ? undefined
          : summary.pageOne.figure === "1"
            ? `${month}: 1 search shows you on Google's first page.`
            : `${month}: ${summary.pageOne.figure} searches show you on Google's first page.`
      }
      action={
        reportUrl === null ? undefined : (
          <a href={reportUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
            <FileText size={16} aria-hidden="true" />
            Monthly report
          </a>
        )
      }
    >
      {nothingYet ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="No search work to show yet"
          text="Pages we improve, listings we fix and the searches that show you on Google's first page appear here as we finish them."
          action={
            <Link href={`${ASK_FOR_A_CHANGE_PATH}?kind=search`} className={DARK_BUTTON}>
              Ask for a change
            </Link>
          }
        />
      ) : (
        <PageColumns
          main={
            <>
              {waiting.length === 0 ? null : (
                <section aria-labelledby="search-waiting-title" className={cn(LIFT, "p-4 sm:p-5")}>
                  <h2 id="search-waiting-title" className={SECTION_TITLE}>
                    Waiting on you
                  </h2>
                  <ul>
                    {waiting.map((item, index) => (
                      <li key={item.key} className={ROW}>
                        <span className="min-w-0">
                          <span className="block text-[0.84375rem] font-semibold text-ink">{item.label}</span>
                          <span className="block text-xs text-ink-2">{item.hint}</span>
                        </span>
                        <Link href={itemHref(item)} aria-label={`Open ${item.label}`} className={index === 0 ? DARK_BUTTON : SOFT_BUTTON}>
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <PageSection id="search-pages" title={`Pages we improved in ${month}`} flush={summary.pages.length > 0}>
                {summary.pages.length === 0 ? (
                  <EmptyState compact icon={ListChecks} title="No pages finished yet this month." text="Each page we improve appears here, with a link to it, once it is finished." />
                ) : (
                  <ul>
                    {summary.pages.map((page) => {
                      const url = httpsUrl(page.linkUrl);
                      return (
                        <li key={page.id} className={ROW}>
                          <span className="min-w-0 text-[0.84375rem] font-semibold text-ink">
                            {url === null ? (
                              page.title
                            ) : (
                              <a href={url} target="_blank" rel="noopener noreferrer" className={EXTERNAL_LINK}>
                                {page.title}
                              </a>
                            )}
                          </span>
                          {page.dueOn === null ? null : <span className="font-figure text-xs tabular-nums text-ink-2">{dueLabel(page.dueOn)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PageSection>

              <PageSection id="search-listings" title="Listings we fixed" flush={summary.listings.length > 0}>
                {summary.listings.length === 0 ? (
                  <EmptyState compact icon={MapPin} title="No listings fixed yet this month." text="When we correct your details on Google and other sites, each fix appears here." />
                ) : (
                  <ul>
                    {summary.listings.map((listing) => (
                      <li key={listing.id} className="border-b border-line py-3 text-[0.84375rem] font-semibold text-ink last:border-b-0">
                        {listing.title}
                      </li>
                    ))}
                  </ul>
                )}
              </PageSection>
            </>
          }
          aside={
            <PageSection id="search-first-page" title="Searches on Google's first page">
              {summary.pageOne === null ? (
                <EmptyState compact icon={ChartLineUp} title="No count yet" text="We count these once a month and add the figure here." />
              ) : (
                <div>
                  <p className="font-figure text-[2.25rem] font-semibold leading-none tabular-nums text-ink">{summary.pageOne.figure}</p>
                  {summary.pageOne.detail === null ? null : <p className="mt-2 text-[0.8125rem] text-ink-2">{summary.pageOne.detail}</p>}
                </div>
              )}
            </PageSection>
          }
        />
      )}
    </PageFrame>
  );
}
