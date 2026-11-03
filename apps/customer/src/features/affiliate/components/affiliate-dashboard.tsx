import type { Affiliate, AffiliateCodeUsage, AffiliateEarning, AffiliateEarningStatus, AffiliateMonthlyActivity, AffiliatePayout, ListedReferralCode } from "@brandbasket/db";
import { describeDiscountMonths, describeReferralDiscount } from "@brandbasket/shared/lib/billing/referral-value";
import { MetricStrip, Panel, PanelData, PanelError, type Metric } from "@/components";
import { formatDate, formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { Badge, Banner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type BadgeTone } from "@/ui";
import {
  cashOutFigure,
  codeStatus,
  dayAsDate,
  monthLabel,
  monthRows,
  payingLine,
  primaryCashOut,
  type CodeStatus,
} from "../rules/dashboard";
import type { CodesView, FiguresView } from "../server/dashboard";
import { CopyCodeButton } from "./copy-code-button";

export interface AffiliateDashboardProps {
  readonly affiliate: Affiliate;
  readonly now: Date;
  readonly codes: Loaded<CodesView>;
  readonly figures: Loaded<FiguresView>;
  readonly monthly: Loaded<readonly AffiliateMonthlyActivity[]>;
  readonly earnings: Loaded<readonly AffiliateEarning[]>;
  readonly payouts: Loaded<readonly AffiliatePayout[]>;
  /** How many months the monthly table covers. */
  readonly monthsShown: number;
  readonly earningLimit: number;
  readonly payoutLimit: number;
}

const CODE_TONE: Readonly<Record<CodeStatus["tone"], BadgeTone>> = { done: "pos", waiting: "warn", quiet: "neutral" };
const EARNING_TONE: Readonly<Record<AffiliateEarningStatus, BadgeTone>> = { owed: "warn", paid: "pos", cancelled: "neutral" };
const EARNING_LABEL: Readonly<Record<AffiliateEarningStatus, string>> = { owed: "To be paid", paid: "Paid", cancelled: "Cancelled" };

/** What a code gives a member, in words. */
function gives(code: ListedReferralCode): string {
  if (code.discount === null) return "No discount for members";
  const amount = describeReferralDiscount(code.discount, code.currency);
  return `Members get ${amount} ${code.discountMonths === null ? "every month" : `a month for ${describeDiscountMonths(code.discountMonths)}`}`;
}

function CodesTable({ codes, usage, affiliate, now }: { readonly codes: readonly ListedReferralCode[]; readonly usage: ReadonlyMap<string, AffiliateCodeUsage>; readonly affiliate: Affiliate; readonly now: Date }) {
  return (
    <Table aria-label="Your codes">
      <TableHead>
        <TableHeader>Code</TableHeader>
        <TableHeader>Status</TableHeader>
        <TableHeader hideOnPhone>What members get</TableHeader>
        <TableHeader align="end">Members</TableHeader>
        <TableHeader align="end" hideOnPhone>
          Discount given
        </TableHeader>
      </TableHead>
      <TableBody>
        {codes.map((code) => {
          const status = codeStatus(code, affiliate.active, now);
          const used = usage.get(code.id);
          return (
            <TableRow key={code.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="break-all type-sub tracking-wide">{code.code}</span>
                  <CopyCodeButton code={code.code} />
                </div>
              </TableCell>
              <TableCell>
                <Badge tone={CODE_TONE[status.tone]}>{status.label}</Badge>
              </TableCell>
              <TableCell hideOnPhone>{gives(code)}</TableCell>
              <TableCell align="end">{used?.members ?? 0}</TableCell>
              <TableCell align="end" hideOnPhone>
                {code.discount === null ? "None" : formatMoney(used?.discountGivenCents ?? 0, code.currency)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Figures({ figures }: { readonly figures: Loaded<FiguresView> }) {
  if (!figures.ok) {
    return (
      <Panel title="Your figures">
        <PanelError failure={figures.error} what="your figures" />
      </Panel>
    );
  }
  const { members, cashOut } = figures.data;
  const metrics: Metric[] = [
    { label: "Members", value: formatNumber(members.total), ...(members.total === 0 ? {} : { period: `${formatNumber(members.paying)} paying now` }) },
    { label: "Earned", value: cashOutFigure(cashOut, "earnedCents") },
    { label: "To be paid", value: cashOutFigure(cashOut, "pendingCents") },
  ];
  const cashed = primaryCashOut(cashOut);
  const withheld = cashOut.some((row) => row.withheldCents > 0);
  const cancelled = cashOut.some((row) => row.cancelledCents > 0);
  return (
    <>
      <MetricStrip label="Your figures" metrics={metrics} />
      {cashed === null ? null : (
        <Panel title="Cash-out" flush>
          <Table aria-label="Cash-out">
            <TableBody>
              <TableRow>
                <TableCell>Cashed out</TableCell>
                <TableCell align="end">{cashOutFigure(cashOut, "cashedOutCents")}</TableCell>
              </TableRow>
              {withheld ? (
                <TableRow>
                  <TableCell>Withheld</TableCell>
                  <TableCell align="end">{cashOutFigure(cashOut, "withheldCents")}</TableCell>
                </TableRow>
              ) : null}
              <TableRow>
                <TableCell>Received</TableCell>
                <TableCell align="end">{cashOutFigure(cashOut, "receivedCents")}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>To be paid</TableCell>
                <TableCell align="end">{cashOutFigure(cashOut, "pendingCents")}</TableCell>
              </TableRow>
              {cancelled ? (
                <TableRow>
                  <TableCell>Cancelled after a refund</TableCell>
                  <TableCell align="end">{cashOutFigure(cashOut, "cancelledCents")}</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Panel>
      )}
    </>
  );
}

function Monthly({ monthly, now, count }: { readonly monthly: Loaded<readonly AffiliateMonthlyActivity[]>; readonly now: Date; readonly count: number }) {
  if (!monthly.ok) {
    return (
      <Panel title="By month">
        <PanelError failure={monthly.error} what="your months" />
      </Panel>
    );
  }
  const months = monthRows(monthly.data, now, count);
  // A list of empty months says nothing, so a window with no activity shows no panel at all.
  if (months === null) return null;
  return (
    <Panel title="By month" meta={`${payingLine(months.current.payingMembers)}, ${formatMoney(months.current.cents, months.currency)} this month`} flush>
      <Table aria-label="By month">
        <TableHead>
          <TableHeader>Month</TableHeader>
          <TableHeader align="end">Members who paid</TableHeader>
          <TableHeader align="end">Earned</TableHeader>
          <TableHeader align="end" hideOnPhone>
            Refunded
          </TableHeader>
        </TableHead>
        <TableBody>
          {months.rows.map((row) => (
            <TableRow key={row.month}>
              <TableCell>{row.label}</TableCell>
              <TableCell align="end">{row.payingMembers}</TableCell>
              <TableCell align="end">{formatMoney(row.cents, months.currency)}</TableCell>
              <TableCell align="end" hideOnPhone>
                {row.refunded}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

/**
 * An affiliate's whole dashboard, and the only page they have: their coupon, what it brings and what they are owed. Plain
 * tables. Every panel loads on its own, so a failed one says so and the rest still show. Everything is for the signed-in
 * affiliate (requireAffiliate takes it from the session).
 */
export function AffiliateDashboard({ affiliate, now, codes, figures, monthly, earnings, payouts, monthsShown, earningLimit, payoutLimit }: AffiliateDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      {affiliate.active ? null : (
        <Banner tone="info">Your codes are paused, so new members can’t use them. Members who already joined keep earning for you.</Banner>
      )}

      <PanelData
        title="Your code"
        data={codes}
        what="your codes"
        flush
        isEmpty={(view) => view.codes.length === 0}
        empty={{ icon: "Gift", title: "Your code is being set up.", description: "It will appear here." }}
      >
        {(view) => <CodesTable codes={view.codes} usage={view.usage} affiliate={affiliate} now={now} />}
      </PanelData>

      <Figures figures={figures} />

      <Monthly monthly={monthly} now={now} count={monthsShown} />

      <PanelData
        title="Earnings"
        data={earnings}
        what="your earnings"
        flush
        meta={(rows) => (rows.length >= earningLimit ? `Latest ${earningLimit}` : formatQuantity(rows.length, "earning"))}
        isEmpty={(rows) => rows.length === 0}
        empty={{ icon: "Receipt", title: "Nothing yet.", description: "It adds up here each time a member pays." }}
      >
        {(rows) => (
          <Table aria-label="Earnings">
            <TableHead>
              <TableHeader>Month paid</TableHeader>
              <TableHeader hideOnPhone>Date</TableHeader>
              <TableHeader align="end">Amount</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableHead>
            <TableBody>
              {rows.map((earning) => (
                <TableRow key={earning.id}>
                  <TableCell>
                    {monthLabel(earning.cycleNumber, affiliate.rewardCycles)}
                    <span className="type-meta"> ({earning.code})</span>
                  </TableCell>
                  <TableCell hideOnPhone>{formatDate(earning.createdAt, now)}</TableCell>
                  <TableCell align="end">{formatMoney(earning.amountCents, earning.currency)}</TableCell>
                  <TableCell>
                    <Badge tone={EARNING_TONE[earning.status]}>{EARNING_LABEL[earning.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelData>

      <PayoutsPanel payouts={payouts} limit={payoutLimit} now={now} />
    </div>
  );
}

function PayoutsPanel({ payouts, limit, now }: { readonly payouts: Loaded<readonly AffiliatePayout[]>; readonly limit: number; readonly now: Date }) {
  // No payouts yet is nothing to show; a failed read still says so.
  if (payouts.ok && payouts.data.length === 0) return null;
  return (
    <PanelData title="Payouts" data={payouts} what="your payouts" flush meta={(rows) => (rows.length >= limit ? `Latest ${limit}` : formatQuantity(rows.length, "payout"))}>
      {(rows) => (
        <Table aria-label="Payouts">
          <TableHead>
            <TableHeader>Reference</TableHeader>
            <TableHeader>Date</TableHeader>
            <TableHeader align="end">Received</TableHeader>
          </TableHead>
          <TableBody>
            {rows.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell>{payout.reference}</TableCell>
                <TableCell>{formatDate(dayAsDate(payout.paidOn), now)}</TableCell>
                <TableCell align="end">
                  {formatMoney(payout.amountCents - payout.withheldCents, payout.currency)}
                  {payout.withheldCents === 0 ? null : (
                    <span className="block type-meta">
                      of {formatMoney(payout.amountCents, payout.currency)}, {formatMoney(payout.withheldCents, payout.currency)} withheld{payout.withheldReason === null ? "" : `: ${payout.withheldReason}`}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PanelData>
  );
}
