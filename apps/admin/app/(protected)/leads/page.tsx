import { listLeads, type LeadStatus } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SearchIcon } from "@brandbasket/shared/ui/icons";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@brandbasket/shared/lib/lead-status";
import { matchesLeadSearch } from "@/lib/lead-search";
import { leadContactLine } from "@/lib/mask";
import { Avatar } from "@/components/console/avatar";
import { buttonPrimary } from "@/components/console/buttons";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Leads" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isLeadStatus(value: string | undefined): value is LeadStatus {
  return value !== undefined && (LEAD_STATUS_ORDER as readonly string[]).includes(value);
}

/** The view Leads opens on: people who made an account and have not paid, the ones staff follow up. */
const DEFAULT_STATUS: LeadStatus = "account_created";
/** The address's way of asking for every lead, whatever its status. */
const ALL_STATUSES = "all";

function filterHref(status: LeadStatus | null, search: string | undefined, sort: string | undefined): string {
  const params = new URLSearchParams();
  params.set("status", status ?? ALL_STATUSES);
  if (search !== undefined && search !== "") params.set("q", search);
  if (sort !== undefined) params.set("sort", sort);
  const query = params.toString();
  return `/leads?${query}`;
}

/** New is waiting on us; the middle of the funnel is moving; signed-up and paid are done; lost is quiet. */
const STATUS_TONES: Readonly<Record<LeadStatus, StatusTone>> = {
  new: "waiting",
  call_booked: "moving",
  call_done: "moving",
  agreed: "moving",
  invite_sent: "moving",
  account_created: "done",
  paid: "done",
  lost: "quiet",
};

export default async function LeadsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const params = await searchParams;
  const requested = first(params.status);
  const rawSearch = first(params.q)?.trim();
  const search = rawSearch?.toLowerCase();
  // A search from the top bar names no status and is looking for one person, wherever they are in the pipeline.
  const searching = search !== undefined && search !== "";
  const status = requested === ALL_STATUSES ? null : isLeadStatus(requested) ? requested : searching ? null : DEFAULT_STATUS;
  const oldestFirst = first(params.sort) === "oldest";
  const sortParam = oldestFirst ? "oldest" : undefined;

  // The counts describe the whole pipeline, so every lead is read once and the view is derived here.
  // Move the filtering into SQL when the table outgrows a single page of rows.
  const allLeads = await listLeads(getStaffDb(), {});
  const visible = allLeads
    .filter((lead) => (status === null ? true : lead.status === status))
    .filter((lead) => (search === undefined || search === "" ? true : matchesLeadSearch(lead, search)));
  const rows = oldestFirst ? [...visible].reverse() : visible;
  const countOf = (option: LeadStatus): number => allLeads.filter((lead) => lead.status === option).length;

  return (
    <>
      <PageHeader
        title="Leads"
        meta={`${allLeads.length} in all`}
        action={
          <Link href="/leads/new" className={buttonPrimary}>
            Add lead
          </Link>
        }
      />

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
        <form action="/leads" role="search" className="w-full sm:w-80">
          <input type="hidden" name="status" value={status ?? ALL_STATUSES} />
          {sortParam === undefined ? null : <input type="hidden" name="sort" value={sortParam} />}
          <label htmlFor="leads-search" className="sr-only">
            Search leads
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="leads-search"
              name="q"
              type="search"
              defaultValue={rawSearch ?? ""}
              placeholder="Name, business, email or phone"
              className="block w-full rounded-full border border-ink-soft/65 bg-card py-2.5 pl-11 pr-4 text-sm text-ink transition-[border-color,box-shadow] duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </div>
        </form>
        <Link
          href={filterHref(status, search, oldestFirst ? undefined : "oldest")}
          className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-ink sm:ml-auto"
        >
          {oldestFirst ? "Oldest first" : "Newest first"}
          <span aria-hidden="true"> ↕</span>
        </Link>
      </div>

      <div className="mt-5">
        <FilterPills
          label="Filter by status"
          options={[
            { href: filterHref(null, search, sortParam), label: "All", count: allLeads.length, current: status === null },
            ...LEAD_STATUS_ORDER.map((option) => ({
              href: filterHref(option, search, sortParam),
              label: LEAD_STATUS_LABELS[option],
              count: countOf(option),
              current: status === option,
            })),
          ]}
        />
      </div>

      {search === undefined || search === "" ? null : (
        <p className="mt-5 text-sm text-ink-soft">
          Matches for “{rawSearch}”.{" "}
          <Link href={filterHref(status, undefined, sortParam)} className="link-underline">
            Clear
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyLine>
          {allLeads.length === 0
            ? "No leads yet."
            : status === DEFAULT_STATUS && !searching
              ? "No unpaid sign-ups. Everyone who made an account has paid."
              : "No leads match this."}
        </EmptyLine>
      ) : (
        <HairlineList label="Leads">
          {rows.map((lead) => (
            <HairlineRow
              key={lead.id}
              href={`/leads/${lead.id}`}
              lead={<Avatar id={lead.id} name={lead.businessName} />}
              title={lead.businessName}
              sub={leadContactLine(lead.name, lead.phone, lead.email)}
              meta={<StatusDot tone={STATUS_TONES[lead.status]} label={LEAD_STATUS_LABELS[lead.status]} />}
              trail={<LocalDateTime iso={lead.createdAt.toISOString()} variant="timestamp" />}
            />
          ))}
        </HairlineList>
      )}
    </>
  );
}
