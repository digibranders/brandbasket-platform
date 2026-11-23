"use client";

import { DataTable, EmptyState, StatusChip, ToastRegion, useConfirmRun, useToast, type Column } from "@brandbasket/shared/ui/patterns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { sendReportNowAction } from "@/app/(protected)/reports/send-now";
import { sendReportCopy, type ReportRow } from "@/lib/reports-view";

/**
 * Reports to review. A draft or a held report opens its review page, where it is read and sent. A report that was approved but
 * never sent has a failed earlier send, so its verb is Retry send: it asks first and names the owner's address, and a send that
 * fails again shows an error toast with Retry that asks again.
 */
export function ReportsWorkspace({ rows }: { readonly rows: readonly ReportRow[] }): ReactElement {
  const router = useRouter();
  const { show } = useToast();
  const confirm = useConfirmRun();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The toast's Retry asks again before it sends, so it needs `send`, which it is made inside.
  const askAgain = useRef<(row: ReportRow) => void>(() => undefined);

  const send = useCallback(
    async (row: ReportRow): Promise<void> => {
      setBusyId(row.id);
      try {
        const result = await sendReportNowAction(row.id);
        if (result.ok) show({ message: `${row.businessName}, ${row.month}: ${result.notice.text}` });
        else show({ message: `${row.businessName}, ${row.month}: ${result.notice.text}`, tone: "error", retry: () => askAgain.current(row) });
        router.refresh();
      } catch {
        show({ message: `${row.businessName}, ${row.month}: the report could not be sent, and the customer has not seen it.`, tone: "error", retry: () => askAgain.current(row) });
      } finally {
        setBusyId(null);
      }
    },
    [router, show],
  );
  useEffect(() => {
    askAgain.current = (row) => confirm.request(sendReportCopy({ ...row, retry: true }), () => void send(row));
  }, [confirm, send]);

  const columns: readonly Column<ReportRow>[] = [
    { id: "client", header: "Client", cell: (row) => <span className="font-semibold">{row.businessName}</span> },
    { id: "service", header: "Service", hideBelow: "sm", cell: (row) => row.service },
    { id: "month", header: "Month", cell: (row) => row.month },
    { id: "state", header: "State", cell: (row) => <StatusChip label={row.stateLabel} variant={row.chip} /> },
    { id: "opening", header: "Opening line", hideBelow: "sm", cell: (row) => <span className="block max-w-96 truncate text-ink-2">{row.opening}</span> },
  ];

  return (
    <div className="grid gap-4">
      <DataTable
        label="Reports to review"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        primaryVerb={(row) =>
          row.retry
            ? { label: "Retry send", busyLabel: "Sending", busy: busyId === row.id, confirm: sendReportCopy({ ...row, retry: true }), onRun: () => void send(row) }
            : { label: "Review", onRun: () => router.push(`/reports/${row.id}`) }
        }
        onOpen={(id) => router.push(`/reports/${id}`)}
        state={rows.length === 0 ? "empty" : "ready"}
        empty={<EmptyState title="No reports are waiting." description="The drafts for a month are written on the 1st of the next month." />}
      />
      {confirm.dialog}
      <ToastRegion />
    </div>
  );
}
