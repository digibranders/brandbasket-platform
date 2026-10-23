import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { AffiliateCodeUsage, AffiliateEarningStatus, ListedReferralCode } from "@brandbasket/db";
import { describeAffiliateReward, describeDiscountMonths, describeRewardCycles, describeReferralDiscount } from "@brandbasket/shared/lib/billing/referral-value";
import { cn } from "@brandbasket/shared/lib/cn";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { CopyCodeButton } from "@/components/panel/affiliate/copy-code-button";
import { StatusDot, type StatusTone } from "@/components/panel/affiliate/status-dot";
import {
  cashOutFigure,
  cashOutShares,
  codeStatus,
  monthLabel,
  monthRows,
  payingLine,
  primaryCashOut,
} from "@/lib/affiliate-dashboard";
import { requireAffiliateAccess } from "@/lib/server/affiliate-access";
import { loadAffiliateDashboard, MONTHS_SHOWN } from "@/lib/server/affiliate-dashboard";

export const metadata: Metadata = { title: "My coupon" };

// Never cached: it is one person's money, read fresh on every visit.
export const dynamic = "force-dynamic";

const EARNING_TONE: Readonly<Record<AffiliateEarningStatus, StatusTone>> = { owed: "waiting", paid: "done", cancelled: "quiet" };
const EARNING_LABEL: Readonly<Record<AffiliateEarningStatus, string>> = { owed: "To be paid", paid: "Paid", cancelled: "Cancelled" };

/** The first name, for the greeting. */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function Figure({ value, label, note }: { readonly value: string | number; readonly label: string; readonly note?: string }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="font-serif text-5xl leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium text-ink-soft">{label}</p>
      {note === undefined ? null : <p className="mt-0.5 text-sm text-ink-soft">{note}</p>}
    </div>
  );
}

/** "1 member", "3 members". */
function membersLine(count: number): string {
  return count === 1 ? "1 member" : `${String(count)} members`;
}

/**
 * One code: the code itself, large enough to read across a table, what it gives a member, and how it has been used:
 * who paid on it, and how much discount it has given in all.
 */
function CodeRow({
  code,
  usage,
  affiliateActive,
  now,
}: {
  readonly code: ListedReferralCode;
  readonly usage: AffiliateCodeUsage | undefined;
  readonly affiliateActive: boolean;
  readonly now: Date;
}): ReactElement {
  const status = codeStatus(code, affiliateActive, now);
  const gives =
    code.discount === null
      ? "No discount for members"
      : `Members get ${describeReferralDiscount(code.discount, code.currency)} ${code.discountMonths === null ? "every month" : `a month for ${describeDiscountMonths(code.discountMonths)}`}`;
  const members = usage?.members ?? 0;
  const given = usage?.discountGivenCents ?? 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-6">
      <div className="min-w-0">
        <p className="break-all font-serif text-4xl leading-none tracking-[0.06em] sm:text-5xl">{code.code}</p>
        <p className="mt-3 text-sm text-ink-soft">{gives}</p>
        <p className="mt-1 text-sm tabular-nums">
          {membersLine(members)}
          {code.discount === null ? null : <span className="text-ink-soft"> · {formatMoney(given, code.currency)} given as discount</span>}
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <CopyCodeButton code={code.code} />
        <StatusDot tone={status.tone} label={status.label} />
      </div>
    </li>
  );
}

/** A coloured dot, a figure and what it is: the key to the bar above it, and the numbers themselves. */
function BarKey({ dot, label, value }: { readonly dot: string; readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot)} />
        {label}
      </p>
      <p className="mt-1 font-serif text-3xl leading-none tabular-nums">{value}</p>
    </div>
  );
}

/**
 * An affiliate's whole dashboard, and the only page they have: their coupon, what it brings and what they are owed.
 * Everything is for the signed-in affiliate and nobody else (requireAffiliateAccess takes it from the session).
 */
export default async function AffiliatePage(): Promise<ReactElement> {
  const { user, affiliate } = await requireAffiliateAccess();
  const now = new Date();
  const dashboard = await loadAffiliateDashboard(affiliate, now);

  const primary = primaryCashOut(dashboard.cashOut);
  const shares = primary === null ? null : cashOutShares(primary);
  const hasCancelled = dashboard.cashOut.some((row) => row.cancelledCents > 0);
  const months = monthRows(dashboard.monthly, now, MONTHS_SHOWN);

  return (
    <div className="max-w-3xl">
      <h1 className="panel-title">
        Hello, <em>{firstNameOf(user.name)}.</em>
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        You earn {describeAffiliateReward(affiliate)} · {describeRewardCycles(affiliate.rewardCycles)}
      </p>

      {affiliate.active ? null : (
        <p role="status" className="mt-6 rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
          Your codes are paused, so new members can’t use them. Members who already joined keep earning for you.
        </p>
      )}

      <section aria-label="Your code" className="mt-10">
        {dashboard.codes.length === 0 ? (
          <p className="border-y border-line py-8 text-ink-soft">Your code is being set up. It will appear here.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {dashboard.codes.map((code) => (
              <CodeRow key={code.id} code={code} usage={dashboard.usage.get(code.id)} affiliateActive={affiliate.active} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your figures" className="mt-12 flex flex-wrap gap-x-16 gap-y-8">
        <Figure
          value={dashboard.members.total}
          label="Members"
          note={dashboard.members.total === 0 ? undefined : `${String(dashboard.members.paying)} paying now`}
        />
        <Figure value={cashOutFigure(dashboard.cashOut, "earnedCents")} label="Earned" />
        <Figure value={cashOutFigure(dashboard.cashOut, "pendingCents")} label="To be paid" />
      </section>

      {primary === null || shares === null ? null : (
        <section aria-label="Cash-out" className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="panel-section">Cash-out</h2>
            <p className="text-sm tabular-nums text-ink-soft">{cashOutFigure(dashboard.cashOut, "cashedOutCents")} cashed out</p>
          </div>
          {/* Of everything earned: what reached them, what was kept back, and what is still to come. */}
          <div
            role="img"
            aria-label={`Of ${formatMoney(primary.earnedCents, primary.currency)} earned: ${formatMoney(primary.receivedCents, primary.currency)} received, ${formatMoney(primary.withheldCents, primary.currency)} withheld, ${formatMoney(primary.pendingCents, primary.currency)} to be paid`}
            className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-paper-deep"
          >
            <span className="bg-success transition-[width] duration-500 ease-calm" style={{ width: `${String(shares.received)}%` }} />
            <span className="bg-gold-deep transition-[width] duration-500 ease-calm" style={{ width: `${String(shares.withheld)}%` }} />
            <span className="bg-ink-soft/60 transition-[width] duration-500 ease-calm" style={{ width: `${String(shares.pending)}%` }} />
          </div>
          <div className="mt-6 flex flex-wrap gap-x-14 gap-y-6">
            <BarKey dot="bg-success" label="Received" value={cashOutFigure(dashboard.cashOut, "receivedCents")} />
            {dashboard.cashOut.every((row) => row.withheldCents === 0) ? null : (
              <BarKey dot="bg-gold-deep" label="Withheld" value={cashOutFigure(dashboard.cashOut, "withheldCents")} />
            )}
            <BarKey dot="bg-ink-soft/60" label="To be paid" value={cashOutFigure(dashboard.cashOut, "pendingCents")} />
          </div>
          {hasCancelled ? <p className="mt-5 text-sm tabular-nums text-ink-soft">{cashOutFigure(dashboard.cashOut, "cancelledCents")} cancelled after a refund</p> : null}
        </section>
      )}

      {months === null ? null : (
        <section aria-label="By month" className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="panel-section">By month</h2>
            <p className="text-sm tabular-nums text-ink-soft">
              {payingLine(months.current.payingMembers)} · {formatMoney(months.current.cents, months.currency)} this month
            </p>
          </div>
          {/* Each month on its own line: how many members paid, and what it earned. The bar is the commission against the best month. */}
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {months.rows.map((row, index) => (
              <li key={row.month} className="grid grid-cols-[2.75rem_minmax(0,1fr)_5.5rem] items-center gap-x-4 py-3.5">
                <span className={cn("text-sm", index === 0 ? "font-semibold text-accent" : "font-medium")}>{row.label}</span>
                <span className="min-w-0">
                  <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-paper-deep">
                    <span
                      className={cn("block h-full rounded-full transition-[width] duration-500 ease-calm", index === 0 ? "bg-accent" : "bg-accent/40")}
                      style={{ width: row.cents === 0 ? 0 : `${String(Math.max(4, row.widthPercent))}%` }}
                    />
                  </span>
                  <span className="mt-1.5 block text-xs tabular-nums text-ink-soft">
                    {payingLine(row.payingMembers)}
                    {row.refunded === 0 ? null : ` · ${String(row.refunded)} refunded`}
                  </span>
                </span>
                <span className={cn("text-right font-serif text-lg tabular-nums", row.cents === 0 && "text-ink-soft")}>{formatMoney(row.cents, months.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Earnings" className="mt-14">
        <h2 className="panel-section">Earnings</h2>
        {dashboard.earnings.length === 0 ? (
          <p className="mt-4 border-y border-line py-6 text-ink-soft">Nothing yet. It adds up here each time a member pays.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {dashboard.earnings.map((earning) => (
              <li key={earning.id} className="flex items-center justify-between gap-4 py-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {monthLabel(earning.cycleNumber, affiliate.rewardCycles)}
                    <span className="text-ink-soft"> · {earning.code}</span>
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-ink-soft">
                    <LocalDate iso={earning.createdAt.toISOString()} />
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-serif text-lg tabular-nums">{formatMoney(earning.amountCents, earning.currency)}</span>
                  <StatusDot tone={EARNING_TONE[earning.status]} label={EARNING_LABEL[earning.status]} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dashboard.payouts.length === 0 ? null : (
        <section aria-label="Payouts" className="mt-14">
          <h2 className="panel-section">Payouts</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {dashboard.payouts.map((payout) => (
              <li key={payout.id} className="flex items-center justify-between gap-4 py-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{payout.reference}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-ink-soft">
                    {payout.paidOn}
                    {payout.withheldCents === 0 ? null : ` · ${formatMoney(payout.withheldCents, payout.currency)} withheld · ${payout.withheldReason ?? ""}`}
                  </span>
                </span>
                {/* What reached them; when something was kept back, what it was out of sits underneath. */}
                <span className="shrink-0 text-right">
                  <span className="block font-serif text-lg tabular-nums">{formatMoney(payout.amountCents - payout.withheldCents, payout.currency)}</span>
                  {payout.withheldCents === 0 ? null : (
                    <span className="block text-xs tabular-nums text-ink-soft">of {formatMoney(payout.amountCents, payout.currency)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
