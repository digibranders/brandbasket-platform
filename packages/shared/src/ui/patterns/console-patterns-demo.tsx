"use client";

import { useMemo, useState, type ReactElement } from "react";
import { BulkBar } from "./bulk-bar";
import { patternButtonSecondary } from "./button-classes";
import { CommandBar, type CommandItem } from "./command-bar";
import { DataTable, type Column } from "./data-table";
import { FilterBar } from "./filter-bar";
import { InlineEdit } from "./inline-edit";
import { RowActions } from "./row-actions";
import { helpShortcut, ShortcutHelp } from "./shortcut-help";
import { SidePanel } from "./side-panel";
import { StatusChip } from "./status-chip";
import { ToastRegion, toastStore } from "./toast";
import { useShortcuts, type Shortcut } from "./use-shortcuts";

interface DemoRow {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly kind: "customers" | "money" | "system";
  readonly late: boolean;
  readonly age: string;
}

const ROWS: readonly DemoRow[] = [
  { id: "r1", name: "Business A", line: "Replied once, asked for a quote", kind: "customers", late: true, age: "5h 12m" },
  { id: "r2", name: "Business B", line: "New enquiry, no contact yet", kind: "customers", late: false, age: "42m" },
  { id: "r3", name: "Business C", line: "Payment needs a look", kind: "money", late: false, age: "3h 04m" },
];

const COLUMNS: readonly Column<DemoRow>[] = [
  {
    id: "work",
    header: "Work",
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{row.name}</span>
        <span className="truncate text-xs leading-4 text-ink-3">{row.line}</span>
      </span>
    ),
  },
  { id: "type", header: "Type", hideBelow: "sm", cell: (row) => <StatusChip label={row.late ? "Late" : "Due today"} variant={row.late ? "failed" : "waiting"} /> },
  { id: "age", header: "Waiting", align: "end", cell: (row) => <span className={`font-mono text-[13px] ${row.late ? "font-medium text-neg-text" : "text-ink-2"}`}>{row.age}</span> },
];

const COMMANDS: readonly CommandItem[] = [
  { id: "go-today", group: "go", title: "Today", hint: "g t", href: "#" },
  { id: "go-money", group: "go", title: "Money", hint: "g m", href: "#" },
  { id: "act-note", group: "action", title: "Add internal note", run: () => toastStore.show({ message: "Internal note added" }) },
];

/**
 * A live specimen of the console v2 interaction patterns, used by the /design-system page of both apps. It wires every
 * pattern to sample rows so keyboard, focus return and the toast timers can be tried by hand. Not a product screen.
 */
export function ConsolePatternsDemo(): ReactElement {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [owner, setOwner] = useState("Owner name from the record");

  const rows = useMemo(
    () => ROWS.filter((row) => (filter === "all" || (filter === "late" ? row.late : row.kind === filter)) && row.name.toLowerCase().includes(query.toLowerCase())),
    [filter, query],
  );
  const open = rows.find((row) => row.id === openId) ?? null;

  const shortcuts: readonly Shortcut[] = [
    { id: "j", keys: "j", label: "Next row", group: "Lists", run: () => undefined },
    { id: "k", keys: "k", label: "Previous row", group: "Lists", run: () => undefined },
    { id: "enter", keys: "enter", label: "Open the row in the panel", group: "Lists", run: () => undefined },
    { id: "e", keys: "e", label: "Run the row verb", group: "Lists", run: () => undefined },
    { id: "x", keys: "x", label: "Select the row", group: "Lists", run: () => undefined },
    { id: "goto-today", keys: "g t", label: "Go to Today", group: "Go to", run: () => undefined },
    helpShortcut(() => setHelpOpen(true)),
  ];
  // Only `?` is live in the demo; the rest are listed so the help shows the real map.
  useShortcuts([helpShortcut(() => setHelpOpen(true))]);

  const step = (direction: 1 | -1): void => {
    const index = rows.findIndex((row) => row.id === openId);
    const next = rows[index + direction];
    if (next) setOpenId(next.id);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={patternButtonSecondary} onClick={() => setCommandOpen(true)}>
          Command bar
        </button>
        <button type="button" className={patternButtonSecondary} onClick={() => setHelpOpen(true)}>
          Shortcuts
        </button>
        <button type="button" className={patternButtonSecondary} onClick={() => toastStore.show({ message: "Marked Business A contacted", undo: async () => undefined })}>
          Toast with undo
        </button>
        <button type="button" className={patternButtonSecondary} onClick={() => toastStore.show({ message: "Report sent to the owner of Business A" })}>
          Plain toast
        </button>
        <button type="button" className={patternButtonSecondary} onClick={() => toastStore.show({ message: "Could not mark Business A contacted. Nothing changed.", tone: "error", retry: () => undefined })}>
          Error toast
        </button>
      </div>

      <FilterBar
        options={[
          { id: "all", label: "All", count: ROWS.length },
          { id: "late", label: "Late", count: ROWS.filter((r) => r.late).length, tone: "late" },
          { id: "customers", label: "Customers", count: ROWS.filter((r) => r.kind === "customers").length },
          { id: "money", label: "Money", count: ROWS.filter((r) => r.kind === "money").length },
          { id: "system", label: "System", count: 0 },
        ]}
        value={filter}
        onChange={setFilter}
        search={{ value: query, onChange: setQuery, placeholder: "Search this list" }}
        echoes={query ? [{ id: "q", label: `Text: ${query}`, onRemove: () => setQuery("") }] : []}
        sticky={false}
      />

      <BulkBar
        ids={[...selected]}
        onClear={() => setSelected(new Set())}
        onSettled={(failed) => setSelected(new Set(failed))}
        actions={[
          {
            id: "contacted",
            label: "Mark contacted",
            busyLabel: "Marking",
            run: async (ids) => ({ done: ids.length, failed: [] }),
            undo: async () => undefined,
            doneMessage: (n) => `Marked ${n} contacted`,
          },
          {
            id: "setup",
            label: "Send setup link",
            run: async (ids) => ({ done: ids.length, failed: [] }),
            confirm: (n) => ({ title: `Send ${n} setup links?`, consequence: "This emails the owner of each selected enquiry a link to finish setting up.", confirmLabel: `Send ${n} links` }),
            doneMessage: (n) => `Sent ${n} setup links`,
          },
        ]}
      />

      <DataTable<DemoRow>
        label="Live example"
        columns={COLUMNS}
        rows={rows}
        rowId={(row) => row.id}
        state={rows.length === 0 ? "empty" : "ready"}
        empty={<p className="px-6 py-8 text-center text-sm text-ink-2">No rows match. Clear the filters.</p>}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        openId={openId}
        onOpen={setOpenId}
        primaryVerb={(row) => ({
          label: row.kind === "money" ? "Check" : "Contact",
          onRun: () => toastStore.show({ message: `Marked ${row.name} contacted`, undo: async () => undefined }),
        })}
        menu={() => [
          { id: "note", label: "Add internal note", onSelect: () => toastStore.show({ message: "Internal note added" }) },
          { id: "quote", label: "Send quote", onSelect: () => undefined, disabledReason: "Quote not paid yet" },
          { id: "close", label: "Close request", destructive: true, onSelect: () => undefined, confirm: { title: "Close this request?", consequence: "It cannot be reopened.", confirmLabel: "Close request" } },
        ]}
      />

      <div className="grid max-w-[480px] gap-4 rounded-[14px] border border-border bg-surface p-4 shadow-card">
        <InlineEdit
          label="Owner name"
          value={owner}
          validate={(next) => (next.trim() === "" ? "Enter a name." : null)}
          onSave={async (next) => {
            const previous = owner;
            setOwner(next);
            return { ok: true, undo: async () => setOwner(previous) };
          }}
        />
        <RowActions verb={{ label: "Reply", onRun: () => undefined }} items={[{ id: "note", label: "Add internal note", onSelect: () => undefined }]} />
      </div>

      <SidePanel
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open ? `Waiting ${open.age}` : undefined}
        onStep={step}
        primary={{ label: "Reply", onRun: () => toastStore.show({ message: "Reply drafted" }) }}
      >
        <p className="text-ink-2">{open?.line}</p>
      </SidePanel>

      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} staticItems={COMMANDS} recent={[]} search={async (term) => ROWS.filter((r) => r.name.toLowerCase().includes(term.toLowerCase())).map((r) => ({ id: r.id, group: "client" as const, title: r.name, subtitle: "Client", href: "#" }))} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={shortcuts} />
      <ToastRegion />
    </div>
  );
}
