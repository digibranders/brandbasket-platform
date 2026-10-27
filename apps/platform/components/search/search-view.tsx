import Link from "next/link";
import type { ReactElement } from "react";
import { DARK_BUTTON, SECTION_TITLE, SOFT_BUTTON } from "@/components/v2/classes";
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

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The Search page: what waits on the customer, the figure, the pages and listings finished this month. */
export function SearchView({ data }: { readonly data: SearchData }): ReactElement {
  const { summary, waiting, report, month } = data;
  const reportUrl = httpsUrl(report);
  return (
    <div className="mx-auto grid w-full max-w-[44rem] gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Search</h1>
          {summary.pageOne === null ? null : (
            <p className="mt-2 text-[0.84375rem] text-ink-2">{`${month}: ${summary.pageOne.figure} searches show you on Google's first page.`}</p>
          )}
        </div>
        {reportUrl === null ? null : (
          <a href={reportUrl} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
            Monthly report
          </a>
        )}
      </header>

      {waiting.length === 0 ? null : (
        <Section id="search-waiting" title="Waiting on you">
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
        </Section>
      )}

      {summary.pageOne === null ? null : (
        <Section id="search-first-page" title="Searches on Google's first page">
          <div className="py-4">
            <p className="font-figure text-[1.875rem] font-semibold leading-none tabular-nums text-ink">{summary.pageOne.figure}</p>
            {summary.pageOne.detail === null ? null : <p className="mt-1.5 text-xs text-ink-2">{summary.pageOne.detail}</p>}
          </div>
        </Section>
      )}

      <Section id="search-pages" title={`Pages we improved in ${month}`}>
        {summary.pages.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No pages finished yet this month.</p>
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
      </Section>

      <Section id="search-listings" title="Listings we fixed">
        {summary.listings.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No listings fixed yet this month.</p>
        ) : (
          <ul>
            {summary.listings.map((listing) => (
              <li key={listing.id} className="border-b border-line py-3 text-[0.84375rem] font-semibold text-ink last:border-b-0">
                {listing.title}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
