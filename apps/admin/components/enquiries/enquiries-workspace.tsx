"use client";

import {
  BulkBar,
  DataTable,
  EmptyState,
  FilterBar,
  SidePanel,
  StatusChip,
  ToastRegion,
  useConfirmRun,
  useShortcuts,
  useToast,
  type BulkAction,
  type Column,
  type FilterOption,
  type RowActionItem,
  type Shortcut,
} from "@brandbasket/shared/ui/patterns";
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_ORDER } from "@brandbasket/shared/lib/lead-source";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { markContactedAction, restoreEnquiryStatusAction, sendSetupLinkNowAction } from "@/app/(protected)/leads/status-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { ENQUIRY_BUCKETS, ENQUIRY_BUCKET_LABELS, type EnquiryBucket, type EnquiryQuery, type SourceFilter } from "@/lib/enquiries";
import { enquiryListHref, type EnquiryRow } from "@/lib/enquiries-model";
import { setupLinkCopy } from "@/lib/enquiries-copy";
import { useEnquiryStatus } from "./use-enquiry-status";

const SOURCE_OPTIONS: readonly SelectOption[] = [{ value: "any", label: "Any source" }, ...LEAD_SOURCE_ORDER.map((source) => ({ value: source, label: LEAD_SOURCE_LABELS[source] }))];
const enquiries = (count: number): string => (count === 1 ? "1 enquiry" : `${count} enquiries`);
const people = (count: number): string => (count === 1 ? "1 person" : `${count} people`);

export interface EnquiriesWorkspaceProps {
  readonly rows: readonly EnquiryRow[];
  readonly query: EnquiryQuery;
  /** Per stage, for the filter counts. */
  readonly counts: Readonly<Record<Exclude<EnquiryBucket, "all">, number>>;
  /** The `?open=` enquiry, when there is one: the row (it may not be in the list) and its details, rendered on the server. */
  readonly openId: string | null;
  readonly openRow: EnquiryRow | null;
  readonly detail: ReactNode;
  /** Set when the open enquiry could not be loaded. */
  readonly detailFailedFor: string | null;
  readonly empty: { readonly title: string; readonly description: string };
}

/**
 * The Enquiries list with its side panel. The panel has its own URL (`?open=`), so the server loads the enquiry and a reload or a
 * shared link lands on it. Status changes email nobody and show a toast with Undo; the setup link emails the person, so it
 * asks first and names the address.
 */
export function EnquiriesWorkspace({ rows, query, counts, openId, openRow, detail, detailFailedFor, empty }: EnquiriesWorkspaceProps): ReactElement {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(openId);
  const [seenOpenId, setSeenOpenId] = useState<string | null>(openId);
  if (seenOpenId !== openId) {
    setSeenOpenId(openId);
    setTarget(openId);
  }
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [searchText, setSearchText] = useState(query.search);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const confirm = useConfirmRun();

  const refresh = useCallback(() => router.refresh(), [router]);
  const status = useEnquiryStatus(refresh);
  const hrefFor = useCallback((change: Partial<EnquiryQuery>, open: string | null = null): string => enquiryListHref({ ...query, ...change }, open), [query]);

  const go = (href: string): void => startTransition(() => router.push(href, { scroll: false }));
  const open = (id: string): void => {
    setTarget(id);
    startTransition(() => router.push(hrefFor({}, id), { scroll: false }));
  };
  const closePanel = (): void => {
    setTarget(null);
    router.replace(hrefFor({}), { scroll: false });
  };

  // The search runs a moment after typing stops, and only when the text differs from what the page already searched.
  useEffect(() => {
    if (searchText.trim() === query.search) return undefined;
    const timer = window.setTimeout(() => startTransition(() => router.replace(hrefFor({ search: searchText.trim() }), { scroll: false })), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, query.search, router, hrefFor]);

  const targetRow = target === null ? null : (rows.find((row) => row.id === target) ?? (openRow !== null && openRow.id === target ? openRow : null));
  const shown = detail !== null && openRow !== null && openRow.id === target;
  const panelState = target === null || shown ? "ready" : detailFailedFor === target ? "error" : "loading";
  const index = rows.findIndex((row) => row.id === target);

  const shortcuts = useMemo<readonly Shortcut[]>(() => [{ id: "enquiries-new", keys: "n", label: "Add an enquiry", group: "Lists", run: () => router.push("/leads/new") }], [router]);
  useShortcuts(shortcuts);

  const sendLink = useCallback(
    (row: EnquiryRow): void => {
      confirm.request(setupLinkCopy(row.email), () => {
        setSendingId(row.id);
        void sendSetupLinkNowAction(row.id)
          .then((result) => {
            if (!result.ok) show({ message: result.message, tone: "error" });
            else show({ message: `Setup link sent to ${result.email}` });
            refresh();
          })
          .catch(() => show({ message: "The setup link may not have gone. Open the enquiry and try again.", tone: "error" }))
          .finally(() => setSendingId(null));
      });
    },
    [confirm, refresh, show],
  );

  const options: FilterOption[] = ENQUIRY_BUCKETS.map((bucket) => (bucket === "all" ? { id: bucket, label: ENQUIRY_BUCKET_LABELS.all } : { id: bucket, label: ENQUIRY_BUCKET_LABELS[bucket], count: counts[bucket] }));
  const sourceLabel = query.source === "any" ? undefined : LEAD_SOURCE_LABELS[query.source];

  const columns: readonly Column<EnquiryRow>[] = [
    {
      id: "business",
      header: "Business",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.businessName}</span>
          <span className="truncate text-xs leading-4 text-ink-3">{row.contactLine}</span>
        </span>
      ),
    },
    { id: "source", header: "Source", hideBelow: "sm", cell: (row) => row.sourceLabel },
    { id: "wants", header: "Wants", hideBelow: "sm", cell: (row) => (row.plans.length === 0 ? <span className="text-ink-3">Not said</span> : row.plans.join(", ")) },
    {
      id: "waiting",
      header: "Waiting",
      align: "end",
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          {row.chips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} variant="failed" />
          ))}
          <span className={`font-figure text-[13px] ${row.waiting.late ? "font-medium text-error" : "text-ink-2"}`}>{row.waiting.text}</span>
        </span>
      ),
    },
  ];

  const menu = (row: EnquiryRow): readonly RowActionItem[] => [
    { id: "contacted", label: "Mark contacted", onSelect: () => void status.markContacted(row.id, row.businessName), disabledReason: row.canMarkContacted ? undefined : "Only a new enquiry can be marked contacted." },
    { id: "lost", label: "Mark lost", onSelect: () => void status.markLost(row.id, row.businessName), disabledReason: row.canMarkLost ? undefined : "This enquiry cannot be marked lost.", destructive: true },
  ];

  // The status each bulk-marked enquiry had, for the one Undo.
  const previous = useRef(new Map<string, string>());
  const pick = (ids: readonly string[]): EnquiryRow[] => ids.flatMap((id) => rows.find((row) => row.id === id) ?? []);
  const markSelected: BulkAction = {
    id: "contacted",
    label: "Mark contacted",
    busyLabel: "Marking",
    disabledReason: (ids) => (pick(ids).every((row) => row.canMarkContacted) ? null : "Only new enquiries can be marked contacted."),
    run: async (ids) => {
      const failed: string[] = [];
      let done = 0;
      for (const id of ids) {
        const result = await markContactedAction(id);
        if (result.ok) {
          previous.current.set(id, result.previous);
          done += 1;
        } else failed.push(id);
      }
      return { done, failed };
    },
    undo: async (ids) => {
      for (const id of ids) await restoreEnquiryStatusAction(id, previous.current.get(id) ?? "new");
      router.refresh();
    },
    doneMessage: (done) => `Marked ${enquiries(done)} contacted`,
  };
  const linkSelected: BulkAction = {
    id: "link",
    label: "Send setup link",
    busyLabel: "Sending",
    disabledReason: (ids) => (pick(ids).every((row) => row.businessId === null) ? null : "Only people without a website get a setup link."),
    confirm: (count) => ({
      title: `Email the setup link to ${people(count)}?`,
      consequence: "Each person is emailed now and the status moves to Setup link sent. A sent email cannot be unsent.",
      confirmLabel: "Send setup links",
    }),
    run: async (ids) => {
      const failed: string[] = [];
      let done = 0;
      for (const id of ids) {
        const result = await sendSetupLinkNowAction(id);
        if (result.ok) done += 1;
        else failed.push(id);
      }
      return { done, failed };
    },
    doneMessage: (done) => `Setup links sent to ${people(done)}`,
    partialMessage: (done, total, failed) => `${done} of ${total} setup links sent, ${failed} did not go. Open each one that did not go and try again.`,
  };

  const primary =
    targetRow === null
      ? undefined
      : targetRow.businessId === null
        ? { label: "Send setup link", onRun: () => sendLink(targetRow), busy: sendingId === targetRow.id }
        : { label: "View client", onRun: () => router.push(`/clients/${targetRow.businessId}`) };

  const filterBar = (
    <div className="sticky top-0 z-20 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <FilterBar
          label="Enquiries"
          sticky={false}
          options={options}
          value={query.bucket}
          onChange={(id) => go(hrefFor({ bucket: id as EnquiryBucket }))}
          search={{ value: searchText, onChange: setSearchText, placeholder: "Name, business, phone or email" }}
          echoes={sourceLabel === undefined ? [] : [{ id: "source", label: `Source: ${sourceLabel}`, onRemove: () => go(hrefFor({ source: "any" })) }]}
        />
      </div>
      <SelectField id="enquiries-source" aria-label="Source" options={SOURCE_OPTIONS} value={query.source} onChange={(value) => go(hrefFor({ source: value as SourceFilter }))} className={`${fieldClasses} !mt-0 w-44`} />
    </div>
  );

  return (
    <div className="grid gap-4">
      {selected.size > 0 ? (
        <BulkBar
          ids={[...selected]}
          actions={[markSelected, linkSelected]}
          onClear={() => setSelected(new Set())}
          onSettled={(failed) => {
            setSelected(new Set(failed));
            router.refresh();
          }}
        />
      ) : (
        filterBar
      )}
      <DataTable
        label="Enquiries"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: "Open", onRun: () => open(row.id) })}
        menu={menu}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        openId={target}
        onOpen={open}
        state={pending && target === null ? "loading" : rows.length === 0 ? "empty" : "ready"}
        empty={<EmptyState title={empty.title} description={empty.description} />}
      />
      <SidePanel
        open={target !== null}
        onClose={closePanel}
        title={targetRow?.businessName ?? "Enquiry"}
        subtitle={targetRow?.contactLine}
        state={panelState}
        onRetry={refresh}
        onStep={(direction) => {
          const next = rows[index + direction];
          if (next !== undefined) open(next.id);
        }}
        primary={primary}
        secondary={
          targetRow === null ? undefined : (
            <>
              {targetRow.canMarkContacted ? (
                <button type="button" className={buttonSecondary} disabled={status.busyId === targetRow.id} onClick={() => void status.markContacted(targetRow.id, targetRow.businessName)}>
                  Mark contacted
                </button>
              ) : null}
              {targetRow.canMarkLost ? (
                <button type="button" className={buttonSecondary} disabled={status.busyId === targetRow.id} onClick={() => void status.markLost(targetRow.id, targetRow.businessName)}>
                  Mark lost
                </button>
              ) : null}
            </>
          )
        }
      >
        {panelState === "error" ? <p className="text-sm text-ink-2">The enquiry could not be loaded. Nothing was lost.</p> : shown ? detail : null}
      </SidePanel>
      {confirm.dialog}
      <ToastRegion />
    </div>
  );
}
