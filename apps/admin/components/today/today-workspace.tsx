"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  Bug,
  ChatText,
  CheckCircle,
  CreditCard,
  EnvelopeSimple,
  FileText,
  Globe,
  GoogleLogo,
  HourglassMedium,
  Phone,
  PlugsConnected,
  ShieldCheck,
  Stack,
  UserMinus,
  UserPlus,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import {
  BulkBar,
  DataTable,
  EmptyState,
  FilterBar,
  helpShortcut,
  ShortcutHelp,
  SidePanel,
  ToastRegion,
  useShortcuts,
  useUrlParam,
  type BulkAction,
  type Column,
  type FilterOption,
  type RowActionItem,
  type RowGroup,
  type Shortcut,
} from "@brandbasket/shared/ui/patterns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactElement } from "react";
import { resendAllFailedFromTodayAction } from "@/app/(protected)/today-actions";
import { buttonSecondary } from "@/components/console/buttons";
import {
  actionLabel,
  clientIdOf,
  groupTodayQueue,
  matchesTodayFilter,
  NEXT_STEPS,
  rowClock,
  TODAY_FILTERS,
  todayFilterCounts,
  type DueTone,
  type TodayFilter,
  type TodayItem,
  type TodayKind,
} from "@/lib/today-queue";
import { TodayKickoffPrompt, type TodayKickoffItem } from "./kickoff-prompt";

const ICONS: Readonly<Record<TodayKind, Icon>> = {
  payment: CreditCard,
  "add-on": Stack,
  overdue: HourglassMedium,
  due: HourglassMedium,
  "new-lead": EnvelopeSimple,
  request: ChatText,
  signup: UserPlus,
  error: Bug,
  delivery: PlugsConnected,
  kickoff: Phone,
  google: GoogleLogo,
  approved: CheckCircle,
  domain: Globe,
  unconfirmed_start: HourglassMedium,
  privacy: ShieldCheck,
  breach: Warning,
  closure: UserMinus,
  report: FileText,
  preview_silent: HourglassMedium,
};

const CLOCK_TONES: Readonly<Record<DueTone, string>> = { late: "font-semibold text-error", soon: "text-ink", plain: "text-ink-2" };

const GO_TO: readonly { readonly keys: string; readonly label: string; readonly href: string }[] = [
  { keys: "g t", label: "Go to Today", href: "/" },
  { keys: "g c", label: "Go to Clients", href: "/clients" },
  { keys: "g i", label: "Go to Inbox", href: "/support" },
  { keys: "g m", label: "Go to Money", href: "/payments" },
  { keys: "g o", label: "Go to Compliance", href: "/privacy-requests" },
  { keys: "g s", label: "Go to System", href: "/deliveries" },
];

/** What j, k, Enter, e and x do inside the list: the table handles them itself, so they are listed for `?` and not registered twice. */
const LIST_HELP: readonly Shortcut[] = [
  { id: "today-next", keys: "j", label: "Next row", group: "Lists", run: () => undefined },
  { id: "today-previous", keys: "k", label: "Previous row", group: "Lists", run: () => undefined },
  { id: "today-open", keys: "Enter", label: "Open the row's panel", group: "Lists", run: () => undefined },
  { id: "today-verb", keys: "e", label: "Run the row's button", group: "Lists", run: () => undefined },
  { id: "today-select", keys: "x", label: "Select the row", group: "Lists", run: () => undefined },
  { id: "today-filter", keys: "/", label: "Filter the list", group: "Lists", run: () => undefined },
];

export interface TodayWorkspaceProps {
  readonly items: readonly TodayItem[];
  readonly now: Date;
  readonly endOfToday: Date;
  /** Filters whose count could not be read, because a source behind them failed. */
  readonly unreadFilters: readonly TodayFilter[];
  /** True when a source failed: an empty list is then not "all clear". */
  readonly incomplete: boolean;
  readonly kickoffs: readonly TodayKickoffItem[];
}

function Row({ item, now, endOfToday }: { readonly item: TodayItem; readonly now: Date; readonly endOfToday: Date }): ReactElement {
  const Mark = ICONS[item.kind];
  const clock = rowClock(item, now, endOfToday);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] ${clock.tone === "late" ? "bg-error-wash text-error" : "bg-sunken text-ink-2"}`}>
        <Mark size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{item.title}</span>
        {item.detail === "" ? null : <span className="truncate text-xs leading-4 text-ink-3">{item.detail}</span>}
      </span>
    </span>
  );
}

/**
 * The Today list: filter chips with counts, the Late items as the one focal card and the rest in bands beneath it, a side panel
 * with its own URL (`?open=<key>`), and keyboard. A kickoff row opens the kickoff prompt instead of the panel.
 */
export function TodayWorkspace({ items, now, endOfToday, unreadFilters, incomplete, kickoffs }: TodayWorkspaceProps): ReactElement {
  const router = useRouter();
  const [filter, setFilter] = useState<TodayFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [kickoffId, setKickoffId] = useState<string | null>(null);
  const [openKey, setOpenKey] = useUrlParam("open");

  const counts = useMemo(() => todayFilterCounts(items, now), [items, now]);
  const query = search.trim().toLowerCase();
  const shown = useMemo(
    () => items.filter((item) => matchesTodayFilter(item, filter, now) && (query === "" || `${item.title} ${item.detail}`.toLowerCase().includes(query))),
    [items, filter, now, query],
  );
  const { lateRows, otherGroups, otherRows, ordered, bandOf } = useMemo(() => {
    const groups = groupTodayQueue(shown, now, endOfToday);
    const late = groups.find((group) => group.heading === "Late")?.items ?? [];
    const others = groups.filter((group) => group.heading !== "Late");
    const rest = others.flatMap((group) => group.items);
    return {
      lateRows: late,
      otherGroups: others,
      otherRows: rest,
      ordered: [...late, ...rest],
      bandOf: new Map(others.flatMap((group) => group.items.map((item) => [item.key, group.heading] as const))),
    };
  }, [shown, now, endOfToday]);
  const bands: readonly RowGroup[] = otherGroups.map((group) => ({ id: group.heading, label: group.heading, count: group.items.length }));

  const kickoff = kickoffs.find((call) => `kickoff:${call.businessId}` === kickoffId) ?? null;
  const openItem = openKey === null ? undefined : items.find((item) => item.key === openKey && item.kind !== "kickoff");

  const act = (item: TodayItem): void => {
    if (item.kind === "kickoff") setKickoffId(item.key);
    else router.push(item.href);
  };
  const open = (key: string): void => {
    const item = items.find((candidate) => candidate.key === key);
    if (item === undefined) return;
    if (item.kind === "kickoff") setKickoffId(item.key);
    else setOpenKey(key);
  };
  const verbLabel = (item: TodayItem): string => item.action ?? actionLabel(item.kind);

  const shortcuts = useMemo<readonly Shortcut[]>(
    () => [
      helpShortcut(() => setHelpOpen(true)),
      ...GO_TO.map((target): Shortcut => ({ id: `go-${target.keys}`, keys: target.keys, label: target.label, group: "Go to", run: () => router.push(target.href) })),
    ],
    [router],
  );
  useShortcuts(shortcuts);

  const resendAll: BulkAction = {
    id: "resend",
    label: "Send again",
    busyLabel: "Sending",
    disabledReason: (ids) => (ids.every((id) => items.find((item) => item.key === id)?.kind === "delivery") ? null : "No bulk action fits these rows together."),
    confirm: () => ({
      title: "Send the failed deliveries again?",
      consequence: "This emails customers again. At most 25 emails and 25 alerts from the last 24 hours are sent.",
      confirmLabel: "Send again",
      cancelLabel: "Keep",
    }),
    run: async (ids) => {
      const { sent, failed } = await resendAllFailedFromTodayAction();
      return { done: sent, failed: failed > 0 ? ids : [] };
    },
    doneMessage: (done) => `${done} sent again.`,
    partialMessage: (done, _total, failed) => `${done} sent again, ${failed} could not be sent.`,
  };

  const options: FilterOption[] = TODAY_FILTERS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    count: unreadFilters.includes(entry.id) ? null : counts[entry.id],
    tone: entry.id === "late" ? "late" : undefined,
  }));

  const columns: readonly Column<TodayItem>[] = [
    { id: "what", header: "What", cell: (item) => <Row item={item} now={now} endOfToday={endOfToday} /> },
    {
      id: "clock",
      header: "Clock",
      align: "end",
      cell: (item) => {
        const clock = rowClock(item, now, endOfToday);
        return clock.text === "" ? null : <span className={`font-mono text-[13px] tabular-nums ${CLOCK_TONES[clock.tone]}`}>{clock.text}</span>;
      },
    },
  ];
  const primaryVerb = (item: TodayItem): { readonly label: string; readonly onRun: () => void } => ({ label: verbLabel(item), onRun: () => act(item) });
  const menu = (item: TodayItem): readonly RowActionItem[] => {
    const client = clientIdOf(item);
    return client === null ? [] : [{ id: "client", label: "Open client", onSelect: () => router.push(`/clients/${client}`) }];
  };

  const empty = (
    <EmptyState
      title={items.length === 0 ? "Nothing needs you right now" : "Nothing matches"}
      description={
        items.length === 0
          ? "New requests, payments and calls appear here as they come in. Social posting and monitoring continue on their own."
          : "Change the filter or the search to see the rest of the list."
      }
    />
  );
  const tableProps = {
    rowId: (item: TodayItem): string => item.key,
    primaryVerb,
    menu,
    selectable: true,
    selectedIds: selected,
    onSelectionChange: setSelected,
    openId: openKey,
    onOpen: open,
    columns,
  } as const;
  const index = openItem === undefined ? -1 : ordered.findIndex((item) => item.key === openItem.key);
  const clientId = openItem === undefined ? null : clientIdOf(openItem);

  const filterBar = (
    <FilterBar
      label="Today"
      options={options}
      value={filter}
      onChange={(id) => setFilter(id as TodayFilter)}
      search={{ value: search, onChange: setSearch, placeholder: "Filter this list" }}
      echoes={filter === "all" ? [] : [{ id: "filter", label: TODAY_FILTERS.find((entry) => entry.id === filter)?.label ?? filter, onRemove: () => setFilter("all") }]}
    />
  );

  return (
    <div className="grid gap-4">
      {selected.size > 0 ? <BulkBar ids={[...selected]} actions={[resendAll]} onClear={() => setSelected(new Set())} onSettled={(failed) => { setSelected(new Set(failed)); router.refresh(); }} /> : filterBar}
      {ordered.length === 0 && incomplete ? null : ordered.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-surface shadow-card">{empty}</div>
      ) : (
        <>
          {lateRows.length === 0 ? null : (
            <div className="rounded-[14px] border-t-2 border-t-accent-gold shadow-hero">
              <DataTable<TodayItem> {...tableProps} label="Late" rows={lateRows} state="ready" />
            </div>
          )}
          {otherRows.length === 0 ? null : <DataTable<TodayItem> {...tableProps} label="Due today, waiting and upcoming" rows={otherRows} groups={bands} rowGroup={(item) => bandOf.get(item.key) ?? ""} state="ready" />}
        </>
      )}
      <SidePanel
        open={openItem !== undefined}
        onClose={() => setOpenKey(null)}
        title={openItem?.title ?? "Row"}
        subtitle={openItem?.detail}
        onStep={(direction) => {
          const next = ordered[index + direction];
          if (next !== undefined) open(next.key);
        }}
        primary={openItem === undefined ? undefined : { label: verbLabel(openItem), onRun: () => act(openItem) }}
        secondary={
          clientId === null ? undefined : (
            <Link href={`/clients/${clientId}`} className={buttonSecondary}>
              Open client
            </Link>
          )
        }
      >
        {openItem === undefined ? null : (
          <dl className="grid gap-4">
            {rowClock(openItem, now, endOfToday).text === "" ? null : (
              <div>
                <dt className="text-xs text-ink-2">Clock</dt>
                <dd className={`mt-1 font-mono text-sm tabular-nums ${CLOCK_TONES[rowClock(openItem, now, endOfToday).tone]}`}>{rowClock(openItem, now, endOfToday).text}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-ink-2">Next step</dt>
              <dd className="mt-1">{NEXT_STEPS[openItem.kind]}</dd>
            </div>
          </dl>
        )}
      </SidePanel>
      <TodayKickoffPrompt kickoff={kickoff} onClose={() => setKickoffId(null)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={[...LIST_HELP, ...shortcuts]} />
      <ToastRegion />
    </div>
  );
}
