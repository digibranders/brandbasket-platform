import type { ClientSummary } from "@brandbasket/db";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";

export type RenewalState = "past_due" | "lapsed";

export interface RenewalRow {
  readonly businessId: string;
  readonly businessName: string;
  readonly state: RenewalState;
  /** When the paid period ended, or null when no period was ever recorded. */
  readonly paidThroughAt: Date | null;
  /** Whole days since `paidThroughAt`, never negative; null when there is no date to count from. */
  readonly daysOverdue: number | null;
  readonly href: string;
}

export const RENEWAL_STATE_LABELS: Readonly<Record<RenewalState, string>> = { past_due: "Past due", lapsed: "Lapsed" };

type RenewalClient = Pick<ClientSummary, "billing" | "businessId" | "businessName">;

const DAY_MS = 86_400_000;

/**
 * The state of a client's plan when it needs a person: the provider is still retrying a failed renewal (past due), or the paid
 * period has run out (lapsed). Same rule as the Today queue's billing rows (`queueFrom` in `lib/server/today.ts`).
 */
export function renewalState(client: Pick<ClientSummary, "billing">, now: Date): RenewalState | null {
  if (client.billing.subscription?.status === "past_due") return "past_due";
  return clientPaymentState(client.billing, now).kind === "lapsed" ? "lapsed" : null;
}

/** Past due and lapsed plans, the longest overdue first. Plans with no recorded date come last. */
export function renewalLane(clients: readonly RenewalClient[], now: Date): readonly RenewalRow[] {
  const rows: RenewalRow[] = [];
  for (const client of clients) {
    const state = renewalState(client, now);
    if (state === null) continue;
    const paidThroughAt = client.billing.subscription?.paidThroughAt ?? null;
    rows.push({
      businessId: client.businessId,
      businessName: client.businessName,
      state,
      paidThroughAt,
      daysOverdue: paidThroughAt === null ? null : Math.max(0, Math.floor((now.getTime() - paidThroughAt.getTime()) / DAY_MS)),
      href: `/clients/${client.businessId}/billing`,
    });
  }
  return rows.sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) || a.businessName.localeCompare(b.businessName));
}

/**
 * The one definition of "Needs a look" on the Money pages: payments still flagged or failed this month, plus plans past due or
 * lapsed. The rail's Money count, the Payments tile and the Needs a look strip all add these two numbers.
 */
export function moneyNeedsALookCount(parts: { readonly payments: number; readonly renewals: number }): number {
  return parts.payments + parts.renewals;
}
