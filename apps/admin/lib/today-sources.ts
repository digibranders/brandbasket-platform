import type { ClientSummary, OpenClosure, ReportForReview, StoredBreach, StoredPrivacyRequest } from "@brandbasket/db";
import { breachDeadlines } from "@brandbasket/shared/lib/breach-deadlines";
import { REQUEST_KIND_LABELS } from "@/lib/privacy-request-form";
import { monthRange } from "./team-time";
import {
  CLOSURE_SOON_DAYS,
  REPORT_REVIEW_DAYS,
  SILENT_PREVIEW_DAYS,
  type BreachReportDue,
  type ClosureErasingSoon,
  type PrivacyRequestDue,
  type ReportsToReview,
  type SilentPreview,
} from "./today-queue";

const DAY_MS = 86_400_000;

/** Open privacy requests with the words for their kind; a closed request has nothing left to do. */
export function privacyRequestsDue(requests: readonly StoredPrivacyRequest[]): readonly PrivacyRequestDue[] {
  return requests
    .filter((request) => request.status !== "closed")
    .map((request) => ({ id: request.id, reference: request.reference, kindLabel: REQUEST_KIND_LABELS[request.kind], dueAt: request.dueAt }));
}

/** One entry per open breach that still owes a report: the CERT-In report first, then the Board's. */
export function breachReportsDue(breaches: readonly StoredBreach[]): readonly BreachReportDue[] {
  return breaches.flatMap((breach): BreachReportDue[] => {
    if (breach.status === "closed") return [];
    const deadlines = breachDeadlines(breach.detectedAt);
    if (breach.reportedCertInAt === null) return [{ id: breach.id, summary: breach.summary, duty: "CERT-In", deadline: deadlines.certInBy }];
    if (breach.reportedBoardAt === null) return [{ id: breach.id, summary: breach.summary, duty: "Data Protection Board", deadline: deadlines.boardReportBy }];
    return [];
  });
}

/** Closures whose erase date is within CLOSURE_SOON_DAYS (or already past). The name comes from the client list; an account missing from it still shows. */
export function closuresErasingSoon(closures: readonly OpenClosure[], clients: readonly Pick<ClientSummary, "businessId" | "businessName">[], now: Date): readonly ClosureErasingSoon[] {
  const names = new Map(clients.map((client) => [client.businessId, client.businessName]));
  const horizon = now.getTime() + CLOSURE_SOON_DAYS * DAY_MS;
  return closures
    .filter((closure) => closure.eraseAfter.getTime() <= horizon)
    .map((closure) => ({ businessId: closure.businessId, businessName: names.get(closure.businessId) ?? "An account", eraseAfter: closure.eraseAfter }));
}

/** The reports still to review (drafts and approved, not held or sent) as one row, due at the end of the 5th of the month; null when none. */
export function reportsToReview(reports: readonly Pick<ReportForReview, "state">[], now: Date): ReportsToReview | null {
  const count = reports.filter((report) => report.state === "draft" || report.state === "approved").length;
  if (count === 0) return null;
  return { count, dueAt: new Date(monthRange(now).start.getTime() + REPORT_REVIEW_DAYS * DAY_MS) };
}

/** Websites whose preview went out and has had no answer for SILENT_PREVIEW_DAYS or more. */
export function silentPreviews(clients: readonly ClientSummary[], now: Date): readonly SilentPreview[] {
  return clients.flatMap((client): SilentPreview[] => {
    const project = client.project;
    if (project === null || project.status !== "preview" || project.previewSentAt === null) return [];
    const days = Math.floor((now.getTime() - project.previewSentAt.getTime()) / DAY_MS);
    return days >= SILENT_PREVIEW_DAYS ? [{ businessId: client.businessId, businessName: client.businessName, sentAt: project.previewSentAt, days }] : [];
  });
}
