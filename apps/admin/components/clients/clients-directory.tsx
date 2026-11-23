"use client";

import {
  DataTable,
  EmptyState,
  FilterBar,
  SidePanel,
  StatusChip,
  useUrlParam,
  type Column,
  type FilterOption,
  type StatusChipVariant,
} from "@brandbasket/shared/ui/patterns";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactElement } from "react";
import { buttonSecondary } from "@/components/console/buttons";
import type { ServiceState } from "@/lib/client-services";
import { clientsListHref } from "@/lib/clients-view";
import type { ClientRowStage } from "@/lib/client-rows";

export interface DirectoryService {
  readonly id: string;
  readonly short: string;
  readonly text: string;
  readonly state: ServiceState;
}

export interface DirectoryRow {
  readonly id: string;
  readonly name: string;
  /** The customer's owner, not a staff member. */
  readonly ownerName: string | null;
  readonly stageLabel: string;
  readonly stageVariant: StatusChipVariant;
  readonly buildLabel: string | null;
  readonly services: readonly DirectoryService[];
  readonly monthly: string;
  /** What needs doing for this client, or null. */
  readonly next: string | null;
  readonly nextIsLate: boolean;
  readonly paidThroughIso: string | null;
  /** Something is late or failed: shown as a red dot with a spoken "Late". */
  readonly late: boolean;
}

export interface StageOption {
  readonly id: ClientRowStage | "all";
  readonly label: string;
  readonly count: number;
}

export interface ClientsDirectoryProps {
  readonly rows: readonly DirectoryRow[];
  readonly stages: readonly StageOption[];
  readonly stage: ClientRowStage | null;
  readonly search: string;
  /** Why the list is empty, when it is: nobody has signed up, or the filters match nobody. */
  readonly emptyKind: "none" | "no-match";
}

const SERVICE_VARIANTS: Readonly<Record<ServiceState, StatusChipVariant>> = { active: "active", setup: "waiting", late: "failed", waiting: "idle" };

/** One chip per service; the word after the name says its state, so colour is never the only signal. */
function ServiceChips({ services }: { readonly services: readonly DirectoryService[] }): ReactElement {
  if (services.length === 0) return <span className="text-ink-3">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {services.map((service) => (
        <StatusChip key={service.id} label={`${service.short}: ${service.text}`} variant={SERVICE_VARIANTS[service.state]} />
      ))}
    </span>
  );
}

/**
 * The Clients list: stage filter with counts, search, the table with a quick view in a side panel (`?open=`). Filters and
 * search live in the address, so the server does the filtering and a link to a filtered list works.
 */
export function ClientsDirectory({ rows, stages, stage, search, emptyKind }: ClientsDirectoryProps): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useUrlParam("open");
  const [searchText, setSearchText] = useState(search);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showPaidThrough, setShowPaidThrough] = useState(true);

  useEffect(() => {
    if (searchText.trim() === search) return undefined;
    const timer = window.setTimeout(() => startTransition(() => router.replace(clientsListHref({ stage, search: searchText.trim() }), { scroll: false })), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, search, stage, router]);

  const opened = rows.find((row) => row.id === openId) ?? null;
  const index = rows.findIndex((row) => row.id === openId);
  const go = (href: string): void => startTransition(() => router.push(href));

  const options: FilterOption[] = stages.map((option) => ({ id: option.id, label: option.label, count: option.count }));

  const columns: readonly Column<DirectoryRow>[] = [
    {
      id: "business",
      header: "Business",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 truncate font-semibold">
            {row.late ? (
              <>
                <span aria-hidden="true" className="size-2 flex-none rounded-full bg-error" />
                <span className="sr-only">Late. </span>
              </>
            ) : null}
            {row.name}
          </span>
          <span className="truncate text-xs leading-4 text-ink-3">{[row.buildLabel, row.ownerName ?? "No owner"].filter((part) => part !== null).join(" · ")}</span>
        </span>
      ),
    },
    { id: "services", header: "Services", hideBelow: "sm", cell: (row) => <ServiceChips services={row.services} /> },
    { id: "stage", header: "Stage", cell: (row) => <StatusChip label={row.stageLabel} variant={row.stageVariant} /> },
    { id: "monthly", header: "Monthly", align: "end", hidden: !showMonthly, hideBelow: "sm", cell: (row) => <span className="font-figure text-[13px]">{row.monthly}</span> },
    { id: "next", header: "Next", cell: (row) => (row.next === null ? <span className="text-ink-3">None</span> : <span className={row.nextIsLate ? "font-semibold text-error" : "font-semibold"}>{row.next}</span>) },
    {
      id: "paid-through",
      header: "Paid through",
      align: "end",
      hidden: !showPaidThrough,
      hideBelow: "sm",
      cell: (row) => (row.paidThroughIso === null ? <span className="text-ink-3">None</span> : <LocalDate iso={row.paidThroughIso} />),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar
            label="Clients"
            options={options}
            value={stage ?? "all"}
            onChange={(id) => go(clientsListHref({ stage: id === "all" ? null : (id as ClientRowStage), search }))}
            search={{ value: searchText, onChange: setSearchText, placeholder: "Search clients" }}
          />
        </div>
        <details className="relative">
          <summary className={`${buttonSecondary} cursor-pointer list-none`}>Columns</summary>
          <div className="absolute right-0 z-30 mt-1 grid min-w-44 gap-1 rounded-xl border border-line bg-surface p-2 shadow-hero">
            <label className="flex min-h-9 items-center gap-2 px-2 text-sm">
              <input type="checkbox" checked={showMonthly} onChange={(event) => setShowMonthly(event.target.checked)} />
              Monthly
            </label>
            <label className="flex min-h-9 items-center gap-2 px-2 text-sm">
              <input type="checkbox" checked={showPaidThrough} onChange={(event) => setShowPaidThrough(event.target.checked)} />
              Paid through
            </label>
          </div>
        </details>
      </div>
      <DataTable
        label="Clients"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: "Open", onRun: () => router.push(`/clients/${row.id}`) })}
        openId={openId}
        onOpen={(id) => setOpenId(id)}
        state={pending ? "loading" : rows.length === 0 ? "empty" : "ready"}
        empty={
          emptyKind === "none" ? (
            <EmptyState title="No clients yet." description="Clients appear here as soon as someone signs up." />
          ) : (
            <EmptyState
              title={search === "" ? "No client matches these filters." : `No client matches “${search}”.`}
              description="Clear the search or the filters to see every client again."
              action={
                <Link href="/clients" className={buttonSecondary}>
                  Clear filters
                </Link>
              }
            />
          )
        }
      />
      <SidePanel
        open={opened !== null}
        onClose={() => setOpenId(null)}
        title={opened?.name ?? "Client"}
        subtitle={opened?.ownerName ?? undefined}
        onStep={(direction) => {
          const next = rows[index + direction];
          if (next !== undefined) setOpenId(next.id);
        }}
        primary={opened === null ? undefined : { label: "Open client", onRun: () => router.push(`/clients/${opened.id}`) }}
      >
        {opened === null ? null : (
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Stage</dt>
              <dd className="mt-1">
                <StatusChip label={opened.stageLabel} variant={opened.stageVariant} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Services</dt>
              <dd className="mt-1">
                <ServiceChips services={opened.services} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Monthly</dt>
              <dd className="font-figure">{opened.monthly}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Next</dt>
              <dd className={opened.nextIsLate ? "font-semibold text-error" : "font-semibold"}>{opened.next ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Paid through</dt>
              <dd>{opened.paidThroughIso === null ? "None" : <LocalDate iso={opened.paidThroughIso} />}</dd>
            </div>
          </dl>
        )}
      </SidePanel>
    </div>
  );
}
