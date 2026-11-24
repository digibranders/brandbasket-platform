import "server-only";
import { ReportMoveError } from "@brandbasket/db";
import { z } from "zod";
import { reportNotice, type ReportNotice } from "@/lib/reports-view";

export type SendOutcome = "sent" | "owner-turned-off" | "already-sent" | "no-address" | "failed";

/** What the list shows after a send: the same words the review page shows, and whether it is a problem (the toast then offers Retry). */
export interface ReportSendResult {
  readonly ok: boolean;
  readonly notice: ReportNotice;
}

export interface ReportSendDependencies<Granted extends { readonly user: { readonly id: string } }> {
  readonly requireStaff: () => Promise<Granted>;
  /** Approves, makes the PDF, marks sent and emails the owner: `sendReportFromConsole`. Rerunning it after a failure is safe. */
  readonly send: (reportId: string, staffUserId: string) => Promise<{ readonly report: { readonly businessId: string; readonly month: string; readonly service: string }; readonly email: SendOutcome }>;
  readonly log: (granted: Granted, reportId: string, result: "ok" | "failed") => Promise<void>;
  readonly record: (granted: Granted, entry: { readonly businessId: string; readonly kind: string; readonly summary: string }) => Promise<void>;
  readonly revalidate: () => void;
}

const idSchema = z.uuid();

/**
 * The send from the Reports list: the same work as `sendReportAction` (it stays as it is for the review page), but it answers with
 * words instead of redirecting, so the list can show a toast and offer Retry.
 */
export function createReportSend<Granted extends { readonly user: { readonly id: string } }>(deps: ReportSendDependencies<Granted>): (reportId: string) => Promise<ReportSendResult> {
  return async (reportId) => {
    const granted = await deps.requireStaff();
    const notFound = reportNotice("not-found");
    if (!idSchema.safeParse(reportId).success && notFound !== null) return { ok: false, notice: notFound };
    try {
      const result = await deps.send(reportId, granted.user.id);
      try {
        await deps.log(granted, reportId, "ok");
        await deps.record(granted, { businessId: result.report.businessId, kind: "report.send", summary: `Sent the ${result.report.month.slice(0, 7)} ${result.report.service} report` });
      } catch (error) {
        // The report is sent; a bookkeeping failure must not make the list say it was not.
        console.error("A sent report could not be recorded.", { reportId, error: error instanceof Error ? error.name : "error" });
      }
      deps.revalidate();
      const notice = reportNotice(`sent.${result.email}`);
      return { ok: result.email !== "failed", notice: notice ?? { tone: "ok", text: "The report is sent." } };
    } catch (error) {
      console.error("A monthly report could not be sent.", { reportId, error: error instanceof Error ? error.name : "error" });
      try {
        await deps.log(granted, reportId, "failed");
      } catch {
        /* The failure is still shown; the access log being down must not hide it. */
      }
      const notice = reportNotice(error instanceof ReportMoveError ? error.reason : "send-failed");
      return { ok: false, notice: notice ?? { tone: "problem", text: "The report could not be sent." } };
    }
  };
}
