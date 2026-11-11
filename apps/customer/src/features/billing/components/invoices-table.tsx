"use client";

import { receiptDownloadHref } from "@brandbasket/shared/lib/billing/receipt-download";
import { DataTable, type DataTableColumn } from "@/components";
import { formatDate, formatQuantity } from "@/lib/format";
import { Badge, LinkButton } from "@/ui";
import { PendingSubmit } from "../../checkout/components/pending-submit";
import { payChargeAction } from "../../checkout/actions";
import type { InvoiceView } from "../loader";

/*
 * Invoices (mock screens-c.js, invoices tab, and the inv inspector in overlays.js). A row opens the invoice: its lines as the
 * PDF prints them, the total and who it is billed to, and Download PDF through the receipts route (owner only). A charge
 * still to pay comes first, with Pay, a form post so a prefetch never opens a payment.
 */

interface InvoicesTableProps {
  readonly invoices: readonly InvoiceView[];
  readonly billedTo: string | null;
  readonly canDownload: boolean;
  readonly canPay: boolean;
}

/** Pay posts the charge id; the action checks it is the customer's own open charge. */
function PayForm({ chargeId }: { readonly chargeId: string }) {
  const action = async (formData: FormData) => {
    await payChargeAction(null, formData);
  };
  return (
    <form action={action}>
      <input type="hidden" name="chargeId" value={chargeId} />
      <PendingSubmit variant="secondary">Pay</PendingSubmit>
    </form>
  );
}

export function InvoicesTable({ invoices, billedTo, canDownload, canPay }: InvoicesTableProps) {
  const columns: readonly DataTableColumn<InvoiceView>[] = [
    { key: "invoice", header: "Invoice", cell: (view) => <span className="font-mono">{view.row.number}</span> },
    { key: "date", header: "Date", cell: (view) => formatDate(view.row.date), sortValue: (view) => view.row.date },
    { key: "amount", header: "Amount", align: "end", cell: (view) => view.row.amount, sortValue: (view) => view.row.amountCents },
    { key: "status", header: "Status", cell: (view) => <Badge tone={view.row.tone}>{view.row.status}</Badge> },
    {
      key: "action",
      header: "",
      align: "end",
      cell: (view) =>
        view.row.kind === "due" ? (
          canPay ? <PayForm chargeId={view.row.id} /> : null
        ) : canDownload && view.row.downloadable ? (
          <LinkButton href={receiptDownloadHref([view.row.id])} prefetch={false} size="sm" icon="DownloadSimple">
            PDF
          </LinkButton>
        ) : null,
    },
  ];

  return (
    <DataTable
      label="Invoices"
      rows={invoices}
      columns={columns}
      rowKey={(view) => view.row.id}
      inspect={(view) => ({
        title: <span className="font-mono">{view.row.number}</span>,
        description: formatDate(view.row.date),
        body: (
          <div className="flex flex-col gap-4">
            <div>
              <Badge tone={view.row.tone}>{view.row.status}</Badge>
            </div>
            <dl className="flex flex-col gap-2">
              {(view.lines ?? []).map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-ink-3">{line.label}</dt>
                  <dd className="tabular-nums">{line.amount}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="type-sub text-ink">Total</dt>
                <dd className="type-sub tabular-nums">{view.total}</dd>
              </div>
            </dl>
            {billedTo === null || view.row.kind === "due" ? null : <p className="type-meta">{billedTo}</p>}
          </div>
        ),
        footer:
          view.row.kind === "due" ? (
            canPay ? <PayForm chargeId={view.row.id} /> : undefined
          ) : canDownload && view.row.downloadable ? (
            <LinkButton href={receiptDownloadHref([view.row.id])} prefetch={false} variant="primary" icon="DownloadSimple">
              Download PDF
            </LinkButton>
          ) : undefined,
      })}
      empty={{ icon: "Receipt", title: "No invoices yet", description: "Each payment's invoice or receipt shows here." }}
      count={(n) => formatQuantity(n, "invoice")}
    />
  );
}
