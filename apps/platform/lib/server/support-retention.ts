import "server-only";
import type { DeletingSupportAttachment } from "@fynix/shared/server/support-attachment-maintenance";
export interface RetainedSupportAttachment extends DeletingSupportAttachment {
  readonly ticketId: string | null;
}
/** Closed tickets are kept 24 months after closing (the approved retention schedule, M1 in docs/privacy/PRIVACY-PLAN.md). */
export const SUPPORT_TICKET_RETENTION_MONTHS = 24;

/**
 * How many months closed tickets are kept: the schedule's 24 unless SUPPORT_TICKET_RETENTION_MONTHS sets another whole
 * number from 1 to 120. Anything else, 0 included, is a configuration mistake and throws, so a typo never purges data
 * early and nothing turns the schedule off.
 */
export function supportRetentionMonths(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const value = env.SUPPORT_TICKET_RETENTION_MONTHS?.trim() ?? "";
  if (value === "") return SUPPORT_TICKET_RETENTION_MONTHS;
  const months = Number(value);
  if (
    !/^\d{1,3}$/.test(value) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  )
    throw new RangeError(
      "SUPPORT_TICKET_RETENTION_MONTHS must be 1 to 120 calendar months, or empty for the schedule's 24.",
    );
  return months;
}
export function supportRetentionCutoff(now: Date, months: number): Date {
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  )
    throw new RangeError(
      "Support retention requires a valid date and 1 to 120 calendar months.",
    );
  const first = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    Math.min(now.getUTCDate(), lastDay),
  );
  return cutoff;
}
/** A bounded number of object deletions; ticket content is erased only after every associated object succeeds. */
export async function runSupportRetention(
  deps: {
    readonly claim: (
      cutoff: Date,
      limit: number,
    ) => Promise<{
      ticketIds: string[];
      attachments: readonly RetainedSupportAttachment[];
    }>;
    readonly purge: (
      rows: readonly DeletingSupportAttachment[],
    ) => Promise<{ purged: number; failed: number }>;
    readonly finalize: (ticketIds: readonly string[]) => Promise<number>;
  },
  cutoff: Date,
  limit: number,
): Promise<{ purged: number; failed: number; ticketsPurged: number }> {
  const claim = await deps.claim(cutoff, limit);
  const blocked = new Set(
    claim.attachments
      .slice(limit)
      .flatMap((row) => (row.ticketId === null ? [] : [row.ticketId])),
  );
  let purged = 0;
  let failed = 0;
  for (const row of claim.attachments.slice(0, limit)) {
    const result = await deps.purge([row]);
    purged += result.purged;
    failed += result.failed;
    if (result.failed > 0 && row.ticketId !== null) blocked.add(row.ticketId);
  }
  const ready = claim.ticketIds.filter((id) => !blocked.has(id));
  const ticketsPurged = ready.length === 0 ? 0 : await deps.finalize(ready);
  return { purged, failed, ticketsPurged };
}
