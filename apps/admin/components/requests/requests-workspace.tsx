"use client";

import {
  BulkBar,
  DataTable,
  EmptyState,
  FilterBar,
  SidePanel,
  ToastRegion,
  useShortcuts,
  type BulkAction,
  type Column,
  type FilterOption,
  type RowActionItem,
  type Shortcut,
} from "@brandbasket/shared/ui/patterns";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { closeTicketAction, restoreTicketStatusAction } from "@/app/(protected)/support/status-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { listHref, type ClientQueue, type RequestRow } from "@/lib/requests-model";
import type { RequestDetail } from "@/lib/server/requests-view";
import { RequestChips } from "./request-chips";
import { ComposerActions, ConversationBody, useRequestComposer } from "./request-conversation";
import { useRequestStatus } from "./use-request-status";

export interface RequestCounts {
  readonly needsReply: number;
  readonly waitingOnClient: number;
  readonly done: number;
}

export interface RequestsWorkspaceProps {
  readonly rows: readonly RequestRow[];
  readonly basePath: string;
  /** The queue shown when the address names none: Needs reply on the Inbox, All on a client. */
  readonly defaultQueue: ClientQueue;
  readonly queue: ClientQueue;
  readonly search: string;
  readonly category: string;
  /** Null where there is no count to show (a client's list). */
  readonly counts: RequestCounts | null;
  readonly categoryOptions: readonly SelectOption[];
  /** The `?open=` ticket, when there is one. */
  readonly openId: string | null;
  readonly detail: RequestDetail | null;
  /** Set when the open ticket could not be loaded. */
  readonly detailFailedFor: string | null;
  /** The change request's moves, rendered on the server, shown in the panel of a change request. */
  readonly changeSlot: ReactNode;
  readonly newRequestHref: string;
  readonly nextHref: string | null;
  readonly empty: { readonly title: string; readonly description: string };
}

const CLOCK_CLASSES = { late: "font-medium text-error", soon: "font-medium text-rattan-ink", ok: "text-ink-2" } as const;
const plural = (count: number): string => (count === 1 ? "1 request" : `${count} requests`);

/**
 * The Requests list with its side panel, for the Inbox and for a client's Requests tab. Support tickets and change requests are
 * one list: a type chip says which. The panel has its own URL (`?open=`), so the server loads the conversation and a reload or a
 * shared link lands on it.
 */
export function RequestsWorkspace(props: RequestsWorkspaceProps): ReactElement {
  const { rows, basePath, defaultQueue, queue, search, category, counts, categoryOptions, openId, detail, detailFailedFor, changeSlot, newRequestHref, nextHref, empty } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(openId);
  const [seenOpenId, setSeenOpenId] = useState<string | null>(openId);
  if (seenOpenId !== openId) {
    setSeenOpenId(openId);
    setTarget(openId);
  }
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [searchText, setSearchText] = useState(search);

  const hrefFor = useCallback((change: { readonly queue?: ClientQueue; readonly search?: string; readonly category?: string; readonly open?: string | null }): string => listHref(basePath, defaultQueue, { queue: change.queue ?? queue, search: change.search ?? search, category: change.category ?? category, open: change.open ?? null }), [basePath, defaultQueue, queue, search, category]);
  const refresh = useCallback(() => router.refresh(), [router]);
  const status = useRequestStatus(refresh);

  const go = (href: string): void => startTransition(() => router.push(href, { scroll: false }));
  const open = (id: string): void => {
    setTarget(id);
    startTransition(() => router.push(hrefFor({ open: id }), { scroll: false }));
  };
  const closePanel = (): void => {
    setTarget(null);
    router.replace(hrefFor({}), { scroll: false });
  };

  // The search runs a moment after typing stops, and only when the text differs from what the page already searched.
  useEffect(() => {
    if (searchText.trim() === search) return undefined;
    const timer = window.setTimeout(() => startTransition(() => router.replace(listHref(basePath, defaultQueue, { queue, search: searchText.trim(), category }), { scroll: false })), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, search, router, basePath, defaultQueue, queue, category]);

  const shown = detail !== null && detail.id === target ? detail : null;
  const composer = useRequestComposer(shown, refresh);
  const panelState = target === null ? "ready" : shown !== null ? "ready" : detailFailedFor === target ? "error" : "loading";
  const targetRow = rows.find((row) => row.id === target);
  const index = rows.findIndex((row) => row.id === target);

  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      { id: "requests-reply", keys: "r", label: "Reply to the open request", group: "Lists", enabled: shown !== null, run: composer.focusReply },
      { id: "requests-new", keys: "n", label: "New request", group: "Lists", run: () => router.push(newRequestHref) },
    ],
    [shown, composer.focusReply, router, newRequestHref],
  );
  useShortcuts(shortcuts);

  const options: FilterOption[] = [
    { id: "needs_reply", label: "Needs reply", count: counts?.needsReply },
    { id: "waiting_on_client", label: "Waiting on customer", count: counts?.waitingOnClient },
    { id: "done", label: "Done", count: counts?.done },
    ...(defaultQueue === "all" ? [{ id: "all", label: "All" } satisfies FilterOption] : []),
  ];
  const categoryLabel = categoryOptions.find((option) => option.value === category)?.label;

  const columns: readonly Column<RequestRow>[] = [
    {
      id: "request",
      header: "Request",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.subject}</span>
          <span className="truncate text-xs leading-4 text-ink-3">
            {row.businessName ?? "No business"} <span className="font-figure">{row.displayRef}</span>
          </span>
        </span>
      ),
    },
    { id: "type", header: "Type", cell: (row) => <RequestChips chips={row.chips} /> },
    { id: "category", header: "Category", hideBelow: "sm", cell: (row) => row.categoryLabel },
    {
      id: "clock",
      header: "Waiting",
      align: "end",
      cell: (row) => (row.clock === null ? <span className="text-ink-3">Done</span> : <span className={`font-figure text-[13px] ${row.clock.running ? CLOCK_CLASSES[row.clock.tone] : "text-ink-3"}`}>{row.clock.text}</span>),
    },
  ];

  const menu = (row: RequestRow): readonly RowActionItem[] => {
    const finished = row.queue === "done";
    const items: RowActionItem[] = [{ id: "page", label: "Open as a page", onSelect: () => router.push(`/support/${row.id}`) }];
    if (row.type === "change") {
      items.push({ id: "status", label: finished ? "Reopen" : "Close", onSelect: () => undefined, disabledReason: "A change request is moved from its panel, because each move emails the customer." });
    } else if (finished) {
      items.push({ id: "status", label: "Reopen", onSelect: () => void status.reopen(row.id), disabledReason: row.status === "closed" ? "A closed request cannot be reopened here." : undefined });
    } else {
      items.push({ id: "status", label: "Close", onSelect: () => void status.close(row.id) });
    }
    return items;
  };

  // The status each bulk-closed request had, for the one Undo.
  const previous = useRef(new Map<string, string>());
  const closable = (id: string): boolean => {
    const row = rows.find((candidate) => candidate.id === id);
    return row !== undefined && row.type === "support" && row.queue !== "done";
  };
  const closeSelected: BulkAction = {
    id: "close",
    label: "Close selected",
    busyLabel: "Closing",
    disabledReason: (ids) => (ids.every(closable) ? null : "Only open support requests close in bulk. A change request is moved from its panel."),
    run: async (ids) => {
      const failed: string[] = [];
      let done = 0;
      for (const id of ids) {
        const result = await closeTicketAction(id);
        if (result.ok) {
          previous.current.set(id, result.previous);
          done += 1;
        } else failed.push(id);
      }
      return { done, failed };
    },
    undo: async (ids) => {
      for (const id of ids) await restoreTicketStatusAction(id, previous.current.get(id) ?? "triaged");
      router.refresh();
    },
    doneMessage: (done) => `${plural(done)} closed. No email was sent.`,
  };

  const filterBar = (
    <div className="sticky top-0 z-20 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <FilterBar
          label="Requests"
          sticky={false}
          options={options}
          value={queue}
          onChange={(id) => go(hrefFor({ queue: id as ClientQueue }))}
          search={{ value: searchText, onChange: setSearchText, placeholder: "Search requests" }}
          echoes={category === "" || categoryLabel === undefined ? [] : [{ id: "category", label: `Category: ${categoryLabel}`, onRemove: () => go(hrefFor({ category: "" })) }]}
        />
      </div>
      <SelectField id="requests-category" aria-label="Category" options={categoryOptions} value={category} onChange={(value) => go(hrefFor({ category: value }))} className={`${fieldClasses} !mt-0 w-48`} />
    </div>
  );

  return (
    <div className="grid gap-4">
      {selected.size > 0 ? (
        <BulkBar
          ids={[...selected]}
          actions={[closeSelected]}
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
        label="Requests"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: row.queue === "done" ? "Open" : "Reply", onRun: () => open(row.id) })}
        menu={menu}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        openId={target}
        onOpen={open}
        state={pending && target === null ? "loading" : rows.length === 0 ? "empty" : "ready"}
        empty={<EmptyState title={empty.title} description={empty.description} />}
      />
      {nextHref === null ? null : (
        <div>
          <Link href={nextHref} className={buttonSecondary}>
            Older requests
          </Link>
        </div>
      )}
      <SidePanel
        open={target !== null}
        onClose={closePanel}
        title={shown?.subject ?? targetRow?.subject ?? "Request"}
        subtitle={shown === null ? targetRow?.displayRef : `${shown.businessName ?? "No business"} ${shown.displayRef}`}
        state={panelState}
        onRetry={refresh}
        onStep={(direction) => {
          const next = rows[index + direction];
          if (next !== undefined) open(next.id);
        }}
        primary={shown === null ? undefined : { label: composer.replyLabel, onRun: composer.sendReply, disabledReason: composer.replyDisabledReason, busy: composer.busy }}
        secondary={shown === null ? undefined : <ComposerActions composer={composer} />}
      >
        {panelState === "error" ? <p className="text-sm text-ink-2">The request could not be loaded. Nothing was lost.</p> : shown === null ? null : (
          <ConversationBody detail={shown} composer={composer}>
            {shown.type === "change" ? changeSlot : null}
          </ConversationBody>
        )}
      </SidePanel>
      <ToastRegion />
    </div>
  );
}
