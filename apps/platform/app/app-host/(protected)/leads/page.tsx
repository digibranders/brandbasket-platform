import type { Metadata } from "next";
import { brandText } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { readListingLeads, type CategoryLeadCount, type ListingLeads } from "@firstfold/db";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { LeadsList } from "@/components/panel/leads/leads-list";
import {
  LEADS_PATH,
  LEADS_PER_PAGE,
  leadsLede,
  leadsPaging,
  leadsWindowStart,
  requestedLeadsPage,
  requestedLeadsTab,
  type LeadsPaging,
  type LeadsTab,
} from "@/lib/leads";
import { LISTING_PAGE_PATH, requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { resolveLeadsSource } from "@/lib/server/leads-owner";

export const metadata: Metadata = { title: "Leads" };

interface LeadsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** What the page says while the free account's business can't have leads yet. */
const WAITING = {
  "no-business": { text: "Add your business, and the people who enquire show up here.", action: "Add your business" },
  // An added business is published by its owner; a listing the directory already had waits for our check.
  pending: { text: "Your leads show up here once your business is live on Firstfold Local.", action: "Go to Business profile" },
  rejected: { text: "We couldn't confirm your business, so it has no page for leads to come from.", action: "Go to Business profile" },
} as const;

/** The longest category label an address may name; a longer one is not a label we stored. */
const CATEGORY_PARAM_MAX = 120;

function leadsHref(page: number, category: string | null, tab: LeadsTab): string {
  const query = new URLSearchParams();
  if (category !== null) query.set("category", category);
  if (tab !== "all") query.set("tab", tab);
  if (page !== 1) query.set("page", String(page));
  const text = query.toString();
  return text === "" ? LEADS_PATH : `${LEADS_PATH}?${text}`;
}

/** The category asked for in the address, or null for every category. */
function requestedCategory(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= CATEGORY_PARAM_MAX ? value : null;
}

/**
 * Which category brought the leads: each category the business lists in, with how many it brought, as a bar against
 * the busiest one. Each is a filter for the list below; shown once the business has leads from more than one category
 * or lists in extra categories.
 */
function CategoryBreakdown({ rows, selected, tab }: { readonly rows: readonly CategoryLeadCount[]; readonly selected: string | null; readonly tab: LeadsTab }): ReactElement {
  const busiest = Math.max(1, ...rows.map((row) => row.total));
  return (
    <section aria-label="Leads by category" className="mt-10 max-w-3xl">
      <h2 className="text-sm font-semibold">By category</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((row) => {
          const active = selected === row.serviceLabel;
          return (
            <li key={row.serviceLabel}>
              <a
                href={leadsHref(1, active ? null : row.serviceLabel, tab)}
                aria-current={active ? "true" : undefined}
                className="group flex items-center gap-4 py-3 text-sm"
              >
                <span className={`w-44 shrink-0 truncate ${active ? "font-semibold text-accent" : "text-ink"}`}>{row.serviceLabel}</span>
                <span aria-hidden="true" className="h-1.5 flex-1 rounded-full bg-paper-deep">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${String(Math.max(4, Math.round((row.total / busiest) * 100)))}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums">{row.total.toLocaleString("en-IN")}</span>
                <span className="w-16 shrink-0 text-right tabular-nums text-ink-soft">{row.sinceCount.toLocaleString("en-IN")} / 30d</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TAB_LABELS: Readonly<Record<LeadsTab, string>> = { all: "All", new: "New", replied: "Replied" };

/** What an empty tab says. */
const EMPTY: Readonly<Record<LeadsTab, string>> = {
  all: "None yet. When someone taps Enquire on your page, they show up here.",
  new: "Nothing new. Every enquiry so far has a reply.",
  replied: "No replies marked yet. After you answer an enquiry, mark it replied and it moves here.",
};

/** All, New and Replied as plain text tabs: the open one in ink with an accent underline, the rest quiet. They wrap on a phone. */
function Tabs({ current, category }: { readonly current: LeadsTab; readonly category: string | null }): ReactElement {
  return (
    <nav aria-label="Enquiries" className="mt-6 flex flex-wrap gap-x-7 gap-y-1 border-b border-line">
      {(["all", "new", "replied"] as const).map((tab) => {
        const active = tab === current;
        return (
          <a
            key={tab}
            href={leadsHref(1, category, tab)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 py-3 text-sm transition-colors duration-300 ease-calm ${
              active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {TAB_LABELS[tab]}
          </a>
        );
      })}
    </nav>
  );
}

/** Newer and older pages, with where this one sits; left out when everything fits on one page. */
function Pager({ paging, category, tab }: { readonly paging: LeadsPaging; readonly category: string | null; readonly tab: LeadsTab }): ReactElement | null {
  if (paging.pageCount === 1) return null;
  return (
    <nav aria-label="Pages of leads" className="mt-6 flex items-center justify-between gap-4 text-sm">
      {paging.newerPage === null ? (
        <span />
      ) : (
        <a href={leadsHref(paging.newerPage, category, tab)} className="group inline-flex items-center gap-2 font-semibold text-accent">
          <ArrowIcon className="size-4 rotate-180 transition-transform duration-300 ease-calm group-hover:-translate-x-1" />
          Newer
        </a>
      )}
      <span className="tabular-nums text-ink-soft">
        Page {paging.page} of {paging.pageCount}
      </span>
      {paging.olderPage === null ? (
        <span />
      ) : (
        <a href={leadsHref(paging.olderPage, category, tab)} className="group inline-flex items-center gap-2 font-semibold text-accent">
          Older
          <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
        </a>
      )}
    </nav>
  );
}

/**
 * The enquiries visitors sent the business from its page in the directory, newest first, a page at a time, under the
 * tabs All / New / Replied. Only enquiries are leads here: a call or a WhatsApp tap on the page is not one, so none is
 * counted or shown. An owner marks an enquiry replied after answering it, and each can be called or messaged on
 * WhatsApp straight from the list; the same enquiries are emailed to the owner as they arrive. A free listing has no
 * limit on its leads. Open to free listing accounts and to website clients with a listing; a free account whose
 * business isn't confirmed yet is told where it stands.
 */
export default async function LeadsPage({ searchParams }: LeadsPageProps): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const { source, hasClaim } = await resolveLeadsSource(tenant);
  if (source.state === "none") notFound();

  if (source.state !== "open") {
    const brand = await requestBrand();
    const waiting = WAITING[source.state];
    return (
      <>
        <header className="border-b border-line pb-6">
          <h1 className="panel-title">Leads</h1>
        </header>
        <p className="mt-6 max-w-prose text-sm text-ink-soft">{brandText(waiting.text, brand)}</p>
        <div className="mt-6">
          <ButtonLink href={LISTING_PAGE_PATH} size="sm" variant="secondary" className="rounded-[0.625rem]!">
            {waiting.action}
          </ButtonLink>
        </div>
      </>
    );
  }

  const params = await searchParams;
  const requested = requestedLeadsPage(params.page);
  const category = requestedCategory(params.category);
  const tab = requestedLeadsTab(params.tab);
  const since = leadsWindowStart(new Date());
  // Enquiries are kept for staff, not in the customer's own rows: read here for this business's own listing only.
  const read = (offset: number): Promise<ListingLeads> =>
    readListingLeads(getStaffDb(), source.business, {
      limit: LEADS_PER_PAGE,
      offset,
      since,
      ...(category === null ? {} : { serviceLabel: category }),
      ...(tab === "all" ? {} : { reply: tab }),
    });
  let leads = await read((requested - 1) * LEADS_PER_PAGE);
  const paging = leadsPaging(leads.total, requested, LEADS_PER_PAGE);
  // A page past the end (leads are never removed, so only a hand-typed address) shows the last page instead.
  if (paging.page !== requested) leads = await read(paging.offset);
  const showBreakdown = leads.byCategory.length > 1 || (hasClaim && leads.byCategory.length > 0);

  return (
    <>
      <header className="border-b border-line pb-6">
        <h1 className="panel-title">Leads</h1>
        <p className="mt-2 text-sm tabular-nums text-ink-soft">{leadsLede({ newCount: leads.replyCounts.new, windowCount: leads.businessSinceCount })}</p>
      </header>
      <Tabs current={tab} category={category} />
      <section aria-label="Your enquiries" className="max-w-3xl">
        {leads.total === 0 ? (
          <p className="border-b border-line py-6 text-sm text-ink-soft">
            {category !== null ? `No enquiries from ${category}${tab === "all" ? " yet" : " here"}.` : EMPTY[tab]}
          </p>
        ) : (
          <>
            <LeadsList leads={leads.leads} offset={paging.offset} showCategory={leads.byCategory.length > 1} />
            <Pager paging={paging} category={category} tab={tab} />
          </>
        )}
      </section>
      {showBreakdown ? <CategoryBreakdown rows={leads.byCategory} selected={category} tab={tab} /> : null}
    </>
  );
}
