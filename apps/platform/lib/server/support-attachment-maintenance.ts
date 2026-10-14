import "server-only";
import {
  claimExpiredSupportAttachments,
  claimSupportTicketsDueRetention,
  finalizeSupportTicketRetention,
  listDeletingSupportAttachments,
  markSupportAttachmentPurged,
  purgeErrorIssues,
  type Database,
} from "@fynix/db";
import { purgeSupportAttachments } from "@fynix/shared/server/support-attachment-maintenance";
import {
  runSupportRetention,
  supportRetentionCutoff,
  supportRetentionMonths,
} from "./support-retention";
import type { SupportStorage } from "@fynix/shared/server/support-storage";

/** Screenshot cleanup, and closed-ticket removal only when retention is on (null means off). */
export async function maintainSupportAttachments(
  db: Database,
  storage: SupportStorage,
  now = new Date(),
  limit = 100,
  retentionMonths: number | null = supportRetentionMonths(),
): Promise<{ purged: number; failed: number; ticketsPurged: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new RangeError(
      "Support maintenance batch size must be between 1 and 1000.",
    );
  await claimExpiredSupportAttachments(db, now, limit);
  const rows = await listDeletingSupportAttachments(db, limit);
  const purge = (pending: typeof rows) =>
    purgeSupportAttachments(
      {
        storage,
        markPurged: (id) => markSupportAttachmentPurged(db, id),
        onError: (id, error) =>
          console.error(
            "Could not purge private support screenshot; retained for retry",
            { attachmentId: id, error },
          ),
      },
      pending,
    );
  const expired = await purge(rows);
  if (retentionMonths === null) return { ...expired, ticketsPurged: 0 };
  const retained = await runSupportRetention(
    {
      claim: (cutoff, batch) =>
        claimSupportTicketsDueRetention(db, cutoff, batch),
      purge: (pending) =>
        purgeSupportAttachments(
          {
            storage,
            markPurged: (id) => markSupportAttachmentPurged(db, id),
            onError: (id, error) =>
              console.error(
                "Could not purge retained support screenshot; ticket content retained for retry",
                { attachmentId: id, error },
              ),
          },
          pending,
        ),
      finalize: (ids) => finalizeSupportTicketRetention(db, ids),
    },
    supportRetentionCutoff(now, retentionMonths),
    limit,
  );
  return {
    purged: expired.purged + retained.purged,
    failed: expired.failed + retained.failed,
    ticketsPurged: retained.ticketsPurged,
  };
}

export interface SupportMaintenanceResult {
  readonly purged: number;
  readonly failed: number;
  readonly ticketsPurged: number;
  readonly errorIssuesPurged: number;
}

/** A bound on one run, so a large backlog is worked off over several runs and never holds the database for long. */
const MAX_ERROR_ISSUE_BATCHES = 10;

async function purgeResolvedErrorIssues(db: Database, now: Date, limit: number): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_ERROR_ISSUE_BATCHES; batch++) {
    const removed = await purgeErrorIssues(db, now, limit);
    total += removed;
    if (removed < limit) break;
  }
  return total;
}

/**
 * The one scheduled maintenance run (`pnpm support:attachments:maintain`). It removes expired staged screenshots and
 * orphaned objects, removes closed tickets after the retention schedule's 24 months (or SUPPORT_TICKET_RETENTION_MONTHS), and removes
 * resolved automatic error issues 90 days after resolution together with expired event receipts. The parts are
 * independent: one failing never skips the others, and the run reports every failure once all parts have been tried.
 * Run it on the staff connection from a scheduler; never expose it as a public endpoint.
 */
export async function runSupportMaintenance(
  db: Database,
  storage: SupportStorage,
  now = new Date(),
  limit = 100,
  retentionMonths?: number | null,
): Promise<SupportMaintenanceResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new RangeError("Support maintenance batch size must be between 1 and 1000.");
  const failures: Error[] = [];
  let months: number | null = null;
  if (retentionMonths === undefined) {
    try {
      months = supportRetentionMonths();
    } catch (error) {
      failures.push(new Error("Support ticket retention is misconfigured, so no closed ticket was removed.", { cause: error }));
    }
  } else {
    months = retentionMonths;
  }

  let screenshots = { purged: 0, failed: 0, ticketsPurged: 0 };
  try {
    screenshots = await maintainSupportAttachments(db, storage, now, limit, months);
  } catch (error) {
    failures.push(new Error("Support screenshot cleanup failed.", { cause: error }));
  }
  let errorIssuesPurged = 0;
  try {
    errorIssuesPurged = await purgeResolvedErrorIssues(db, now, limit);
  } catch (error) {
    failures.push(new Error("Automatic error cleanup failed.", { cause: error }));
  }

  if (failures.length === 1 && failures[0] !== undefined) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "More than one support maintenance step failed.");
  return { ...screenshots, errorIssuesPurged };
}
