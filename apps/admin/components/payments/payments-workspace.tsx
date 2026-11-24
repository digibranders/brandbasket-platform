"use client";

import { DataTable, EmptyState, FilterBar, SidePanel, type Column, type FilterOption, type RowActionItem } from "@brandbasket/shared/ui/patterns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { StatusPill } from "@/components/console/status-pill";
import { PAYMENT_FILTER_LABELS, PAYMENT_FILTERS, paymentOpenHref, type PaymentFilter, type PaymentPanelRow } from "@/lib/payments-view";

export interface PaymentsWorkspaceProps {
  readonly rows: readonly PaymentPanelRow[];
  readonly month: string;
  readonly monthLabel: string;
  readonly filter: PaymentFilter;
  /** How many payments each filter holds; the figures cover the whole month whatever is shown. */
  readonly counts: Readonly<Record<PaymentFilter, number>>;
  /** The `?open=` payment, when there is one. */
  readonly openId: string | null;
  /** The open payment's data, which may be one the chosen filter leaves out of `rows`. Null when it is not in the month. */
  readonly openRow: PaymentPanelRow | null;
  /** Refund and record-a-refund dialogs for the open payment, rendered on the server with their actions. */
  readonly refundSlot: ReactNode;
}

/** Plain words for the panel's facts, so a reader never has to decode a status. */
const STATUS_LINES: Readonly<Record<PaymentPanelRow["rawStatus"], string>> = {
  captured: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * The month's payments: filter pills with counts, a search over what is already loaded, the table, and a side panel for the
 * open payment with its own URL (`?open=`). Refunds sit in the panel and keep their own confirm dialogs; nothing here is bulk.
 */
export function PaymentsWorkspace({ rows, month, monthLabel, filter, counts, openId, openRow, refundSlot }: PaymentsWorkspaceProps): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(openId);
  const [seenOpenId, setSeenOpenId] = useState<string | null>(openId);
  if (seenOpenId !== openId) {
    setSeenOpenId(openId);
    setTarget(openId);
  }
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const shown = term === "" ? rows : rows.filter((row) => `${row.client} ${row.providerPaymentId} ${row.invoice}`.toLowerCase().includes(term));
  const current = openRow !== null && openRow.id === target ? openRow : (rows.find((row) => row.id === target) ?? null);
  const index = shown.findIndex((row) => row.id === target);

  const go = (href: string): void => startTransition(() => router.push(href, { scroll: false }));
  const open = (id: string): void => {
    setTarget(id);
    go(paymentOpenHref(month, filter, id));
  };
  const close = (): void => {
    setTarget(null);
    router.replace(paymentOpenHref(month, filter, null), { scroll: false });
  };

  const options: FilterOption[] = PAYMENT_FILTERS.map((id) => ({ id, label: PAYMENT_FILTER_LABELS[id], count: counts[id], tone: id === "failed" && counts[id] > 0 ? "late" : undefined }));

  const columns: readonly Column<PaymentPanelRow>[] = [
    { id: "when", header: "When", cell: (row) => <span className="font-figure text-[13px] tabular-nums text-ink-2">{row.when}</span> },
    {
      id: "client",
      header: "Client",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.client}</span>
          <span className="truncate text-xs leading-4 text-ink-3">{row.forLabel}</span>
        </span>
      ),
    },
    { id: "method", header: "Method", hideBelow: "sm", cell: (row) => <span className="text-ink-2">{row.method}</span> },
    { id: "amount", header: "Amount", align: "end", cell: (row) => <span className="font-figure tabular-nums">{row.amount}</span> },
    { id: "status", header: "Status", cell: (row) => <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill> },
    { id: "invoice", header: "Invoice", hideBelow: "sm", cell: (row) => <span className="font-figure text-xs">{row.invoice}</span> },
  ];

  const menu = (row: PaymentPanelRow): readonly RowActionItem[] => [{ id: "client", label: "Open client money", onSelect: () => router.push(row.href) }];

  return (
    <div className="grid gap-4">
      <FilterBar
        label="Show payments"
        sticky={false}
        options={options}
        value={filter}
        onChange={(id) => go(paymentOpenHref(month, id as PaymentFilter, null))}
        search={{ value: search, onChange: setSearch, placeholder: "Search client or reference" }}
      />
      <DataTable
        label={`Payments in ${monthLabel}`}
        columns={columns}
        rows={shown}
        rowId={(row) => row.id}
        primaryVerb={(row) => ({ label: "Open", onRun: () => open(row.id) })}
        menu={menu}
        openId={target}
        onOpen={open}
        state={pending && target === null ? "loading" : shown.length === 0 ? "empty" : "ready"}
        empty={
          <EmptyState
            title={term === "" ? `No payments to show for ${monthLabel}.` : "No payment matches that search."}
            description={term === "" ? "Payments from clients appear here as they arrive, with failed ones and refunds." : "Search looks at the client, the provider reference and the invoice number."}
          />
        }
      />
      <SidePanel
        open={target !== null}
        onClose={close}
        title={current === null ? "Payment" : `Payment of ${current.amount}`}
        subtitle={current === null ? undefined : `${current.client} · ${current.forLabel}`}
        state={target !== null && current === null ? "error" : "ready"}
        onRetry={close}
        onStep={(direction) => {
          const next = shown[index + direction];
          if (next !== undefined) open(next.id);
        }}
        primary={current === null ? undefined : { label: "Open client money", onRun: () => router.push(current.href) }}
      >
        {current === null ? (
          <p className="text-sm text-ink-2">This payment is not in {monthLabel}. Pick its month, or open the client to find it.</p>
        ) : (
          <div className="grid gap-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Fact label="Status">
                <StatusPill tone={current.status.tone}>{current.status.label}</StatusPill>
                <span className="sr-only"> {STATUS_LINES[current.rawStatus]}</span>
              </Fact>
              <Fact label="Client">
                <Link href={current.href} className="font-semibold hover:underline">
                  {current.client}
                </Link>
              </Fact>
              <Fact label="When">
                <span className="font-figure tabular-nums">{current.when}</span>
              </Fact>
              <Fact label="Method">{current.method}</Fact>
              <Fact label="Provider reference">
                <span className="break-all font-figure text-xs">{current.providerPaymentId}</span>
              </Fact>
              <Fact label="Invoice">
                <span className="font-figure text-xs">{current.invoice}</span>
              </Fact>
              {current.attentionTitle === null ? null : <Fact label="Flagged because">{current.attentionTitle}</Fact>}
              {current.failureReason === null ? null : <Fact label="Why it failed">{current.failureReason}</Fact>}
              {current.refundReason === null ? null : <Fact label="Why it was refunded">{current.refundReason}</Fact>}
            </dl>
            {refundSlot}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
