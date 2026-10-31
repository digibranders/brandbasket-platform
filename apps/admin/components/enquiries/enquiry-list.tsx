import type { Lead } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_ORDER, websitePlanLabels } from "@brandbasket/shared/lib/lead-source";
import { fieldClasses } from "@/components/console/field-styles";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { TABLE, TD, TH, TR_SELECTED } from "@/components/console/table";
import { ENQUIRY_BUCKETS, ENQUIRY_BUCKET_LABELS, enquiryHref, inBucket, OWNER_FILTERS, OWNER_FILTER_LABELS, waitingOf, type EnquiryQuery } from "@/lib/enquiries";
import { TableScroll } from "@/components/console/table-scroll";

const PLAN_DOT: Readonly<Record<string, string>> = { website: "bg-c-site", growth: "bg-c-growth", search: "bg-c-search" };
const WAITING_TONE = { late: "font-semibold text-error", soon: "font-semibold text-rattan-ink", plain: "text-ink-2" } as const;

interface EnquiryListProps {
  /** Every lead, for the stage counts. */
  readonly all: readonly Lead[];
  /** The leads the query shows. */
  readonly rows: readonly Lead[];
  readonly query: EnquiryQuery;
  readonly selectedId: string | null;
  readonly ownerNames: ReadonlyMap<string, string>;
  readonly now: Date;
}

function sourceLabel(lead: Lead): string {
  return lead.source === "signup" && lead.status === "account_created" ? "Sign-up, not paid" : LEAD_SOURCE_LABELS[lead.source];
}

/** Search, the stage, source and owner filters, and the table (mock screen 2, left). */
export function EnquiryList({ all, rows, query, selectedId, ownerNames, now }: EnquiryListProps): ReactElement {
  return (
    <div className="grid min-w-0 gap-4">
      <form action="/leads" role="search" className="w-full sm:w-80">
        <input type="hidden" name="view" value={query.bucket} />
        {query.source === "any" ? null : <input type="hidden" name="source" value={query.source} />}
        {query.owner === "anyone" ? null : <input type="hidden" name="owner" value={query.owner} />}
        <label htmlFor="enquiry-search" className="sr-only">
          Search enquiries
        </label>
        <input id="enquiry-search" name="q" type="search" defaultValue={query.search} placeholder="Name, business, phone or email" className={fieldClasses} />
      </form>

      <FilterPills
        label="Filter by stage"
        options={ENQUIRY_BUCKETS.map((bucket) => ({
          href: enquiryHref(query, { bucket }),
          label: ENQUIRY_BUCKET_LABELS[bucket],
          ...(bucket === "all" ? {} : { count: all.filter((lead) => inBucket(lead.status, bucket)).length }),
          current: query.bucket === bucket,
        }))}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <FilterPills
          label="Filter by source"
          options={[
            { href: enquiryHref(query, { source: "any" }), label: "Any source", current: query.source === "any" },
            ...LEAD_SOURCE_ORDER.map((source) => ({ href: enquiryHref(query, { source }), label: LEAD_SOURCE_LABELS[source], current: query.source === source })),
          ]}
        />
        <FilterPills
          label="Filter by owner"
          options={OWNER_FILTERS.map((owner) => ({ href: enquiryHref(query, { owner }), label: OWNER_FILTER_LABELS[owner], current: query.owner === owner }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyLine>{all.length === 0 ? "No enquiries yet." : "No enquiries match this."}</EmptyLine>
      ) : (
        <TableScroll label="Enquiries">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Business</th>
                <th className={TH}>Source</th>
                <th className={TH}>Wants</th>
                <th className={TH}>Owner</th>
                <th className={cn(TH, "text-right")}>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const waiting = waitingOf(lead.createdAt, now, lead.status);
                return (
                  <tr key={lead.id} className={lead.id === selectedId ? TR_SELECTED : undefined}>
                    <td className={TD}>
                      <Link href={enquiryHref(query, {}, `/leads/${lead.id}`)} aria-current={lead.id === selectedId ? "page" : undefined} className="font-semibold text-ink hover:underline">
                        {lead.businessName}
                      </Link>
                      <span className="block text-xs text-ink-2">
                        {lead.name}
                        {lead.city === null ? "" : ` · ${lead.city}`}
                      </span>
                    </td>
                    <td className={cn(TD, "text-[0.8125rem]")}>{sourceLabel(lead)}</td>
                    <td className={TD}>
                      {lead.plans.length === 0 ? (
                        <span className="text-ink-2">Not said</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-2">
                          {lead.plans.map((plan) => (
                            <span key={plan} className="inline-flex items-center gap-1 text-xs text-ink-2">
                              <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", PLAN_DOT[plan] ?? "bg-ink-2")} />
                              {websitePlanLabels([plan])[0]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, "text-ink-2")}>{lead.assignedStaffId === null ? "Nobody" : (ownerNames.get(lead.assignedStaffId) ?? "Someone who has left")}</td>
                    <td className={cn(TD, "text-right font-figure text-xs", WAITING_TONE[waiting.tone])}>{waiting.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}
