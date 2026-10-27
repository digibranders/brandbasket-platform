import {
  findAffiliateLoginState,
  findAffiliateTotals,
  listAffiliateEarnings,
  listAffiliateMembers,
  listAffiliatePayouts,
  listOwedEarningIds,
  listReferralCodes,
  type Affiliate,
  type AffiliateEarningStatus,
} from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { describeDiscountMonths, describeReferralDiscount, formatPercent } from "@brandbasket/shared/lib/billing/referral-value";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { TagIcon } from "@brandbasket/shared/ui/icons";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { AffiliateForm, CancelEarningButton, PayoutForm, type AffiliateFormValues } from "@/components/affiliate-forms";
import { AffiliateLoginLink } from "@/components/affiliate-login-link";
import { buttonSecondary } from "@/components/console/buttons";
import { Figures } from "@/components/console/figures";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import { describeAffiliateReward, describeRewardCycles, findAffiliate, payoutToday } from "@/lib/server/affiliate-admin";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { cancelEarningAction, issueLoginLinkAction, recordPayoutAction, updateAffiliateAction } from "./actions";

export const metadata: Metadata = { title: "Affiliate" };

const LIST_LIMIT = 200;

interface AffiliatePageProps {
  readonly params: Promise<{ readonly affiliateId: string }>;
}

const EARNING_TONE: Readonly<Record<AffiliateEarningStatus, StatusTone>> = {
  owed: "waiting",
  paid: "done",
  cancelled: "quiet",
};

const EARNING_LABEL: Readonly<Record<AffiliateEarningStatus, string>> = {
  owed: "Owed",
  paid: "Paid",
  cancelled: "Cancelled",
};

/** The stored affiliate as the edit form starts from it. */
function formValues(affiliate: Affiliate): AffiliateFormValues {
  const { reward } = affiliate;
  return {
    name: affiliate.name,
    email: affiliate.email ?? "",
    phone: affiliate.phone ?? "",
    rewardKind: reward.kind,
    rewardValue:
      reward.kind === "percent"
        ? formatPercent(reward.basisPoints).replace("%", "")
        : reward.amountCents === 0
          ? ""
          : String(reward.amountCents / 100),
    rewardCurrency: affiliate.rewardCurrency ?? "INR",
    rewardCycles: affiliate.rewardCycles === null ? "" : String(affiliate.rewardCycles),
    notes: affiliate.notes ?? "",
    active: affiliate.active,
  };
}

/**
 * One affiliate: what they earn, their codes, the members they brought, every earning, and the payouts that settled
 * them. The affiliate can see their codes and money themselves once they have a sign-in; staff make the link they open
 * to choose a password (the Sign-in section).
 */
export default async function AffiliatePage({ params }: AffiliatePageProps): Promise<ReactElement> {
  await requireStaffCan("money");
  const { affiliateId } = await params;
  const affiliate = await findAffiliate(affiliateId);
  if (affiliate === null) notFound();

  const staffDb = getStaffDb();
  const [codes, members, earnings, payouts, totals, login] = await Promise.all([
    listReferralCodes(staffDb, { affiliateId: affiliate.id }, LIST_LIMIT),
    listAffiliateMembers(staffDb, affiliate.id, LIST_LIMIT),
    listAffiliateEarnings(staffDb, affiliate.id, LIST_LIMIT),
    listAffiliatePayouts(staffDb, affiliate.id, LIST_LIMIT),
    findAffiliateTotals(staffDb, affiliate.id),
    findAffiliateLoginState(staffDb, affiliate.id),
  ]);
  const owing = totals.filter((total) => total.owedCents > 0);
  const owedIds = await Promise.all(owing.map((total) => listOwedEarningIds(staffDb, affiliate.id, total.currency)));
  const contact = [displayPhoneText(affiliate.phone), affiliate.email]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const owedFigure = owing.length === 0 ? "₹0" : owing.map((total) => formatMoney(total.owedCents, total.currency)).join(" + ");
  const paidFigure =
    totals.length === 0 ? "₹0" : totals.map((total) => formatMoney(total.paidCents, total.currency)).join(" + ");

  return (
    <>
      <PageHeader
        back={{ href: "/affiliates", label: "Affiliates" }}
        title={affiliate.name}
        meta={
          <>
            {contact} ·{" "}
            <StatusDot tone={affiliate.active ? "done" : "quiet"} label={affiliate.active ? "Active" : "Off"} className="align-middle" />
          </>
        }
      />

      <Figures
        items={[
          { value: describeAffiliateReward(affiliate), label: "Earns", note: describeRewardCycles(affiliate.rewardCycles) },
          { value: members.length, label: "Members" },
          { value: owedFigure, label: "Owed", emphasis: owing.length > 0 },
          { value: paidFigure, label: "Paid" },
        ]}
      />

      <div className="mt-12">
        <Section
          title="Codes"
          aside={
            <Link href={`/affiliates/${affiliate.id}/codes/new`} className={buttonSecondary}>
              Add code
            </Link>
          }
        >
          {codes.length === 0 ? (
            <EmptyLine>No codes yet. Add one to share.</EmptyLine>
          ) : (
            <HairlineList label="Codes">
              {codes.map((code) => (
                <HairlineRow
                  key={code.id}
                  href={`/coupons/${code.id}`}
                  lead={
                    <span className="grid size-10 place-items-center rounded-full bg-paper-deep text-accent">
                      <TagIcon className="size-5" />
                    </span>
                  }
                  title={<span className="tracking-[0.06em]">{code.code}</span>}
                  sub={`${code.discount === null ? "No discount" : `${describeReferralDiscount(code.discount, code.currency)} · ${describeDiscountMonths(code.discountMonths)}`} · ${code.currency}`}
                  meta={
                    <StatusDot
                      tone={code.active && affiliate.active ? "done" : "quiet"}
                      label={code.active && affiliate.active ? `${code.redemptions} used` : "Off"}
                    />
                  }
                />
              ))}
            </HairlineList>
          )}
        </Section>

        {owing.length === 0 ? null : (
          <Section title="Pay out" aside="After the bank or UPI transfer">
            <div className="max-w-xl space-y-10">
              {owing.map((total, index) => (
                <PayoutForm
                  key={total.currency}
                  action={recordPayoutAction.bind(null, affiliate.id, total.currency)}
                  currency={total.currency}
                  amount={formatMoney(total.owedCents, total.currency)}
                  earningIds={owedIds[index] ?? []}
                  today={payoutToday(new Date())}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Earnings" aside={earnings.length === 0 ? undefined : `${earnings.length}`}>
          {earnings.length === 0 ? (
            <EmptyLine>Nothing earned yet.</EmptyLine>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {earnings.map((earning) => (
                <li key={earning.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3.5">
                  <span className="w-32 shrink-0 whitespace-nowrap text-sm text-ink-soft">
                    <LocalDate iso={earning.createdAt.toISOString()} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{earning.businessName}</span>
                    <span className="block text-xs text-ink-soft">
                      {earning.code} · Month {earning.cycleNumber}
                      {affiliate.rewardCycles === null ? "" : ` of ${affiliate.rewardCycles}`}
                    </span>
                  </span>
                  <span className="w-28 text-right font-serif text-lg tabular-nums">
                    {formatMoney(earning.amountCents, earning.currency)}
                  </span>
                  <span className="flex w-36 items-center justify-end gap-3">
                    <StatusDot tone={EARNING_TONE[earning.status]} label={EARNING_LABEL[earning.status]} />
                    {earning.status === "owed" ? (
                      <CancelEarningButton action={cancelEarningAction.bind(null, affiliate.id, earning.id)} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Members" aside={members.length === 0 ? undefined : `${members.length}`}>
          {members.length === 0 ? (
            <EmptyLine>Nobody yet.</EmptyLine>
          ) : (
            <HairlineList label="Members">
              {members.map((member) => (
                <HairlineRow
                  key={member.businessId}
                  href={`/clients/${member.businessId}`}
                  title={member.businessName}
                  sub={member.code}
                  meta={<StatusDot tone={member.status === "active" ? "done" : "quiet"} label={member.status === "active" ? "Paying" : "Stopped"} />}
                  trail={<LocalDate iso={member.since.toISOString()} />}
                />
              ))}
            </HairlineList>
          )}
        </Section>

        {payouts.length === 0 ? null : (
          <Section title="Payouts">
            <ul className="divide-y divide-line border-y border-line">
              {payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center gap-x-6 py-3.5">
                  <span className="w-32 shrink-0 whitespace-nowrap text-sm text-ink-soft">{payout.paidOn}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{payout.reference}</span>
                    {payout.withheldCents === 0 ? null : (
                      <span className="block truncate text-xs text-ink-soft tabular-nums">
                        {formatMoney(payout.withheldCents, payout.currency)} withheld · {payout.withheldReason}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-soft">{payout.earnings} months</span>
                  <span className="w-28 text-right font-serif text-lg tabular-nums">
                    {formatMoney(payout.amountCents, payout.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Sign-in" aside={login?.signedUp === true ? "Their own dashboard" : undefined}>
          <AffiliateLoginLink
            action={issueLoginLinkAction.bind(null, affiliate.id)}
            signedUp={login?.signedUp ?? false}
            linkExpiresAt={login?.linkExpiresAt?.toISOString() ?? null}
          />
        </Section>

        <Section title="Details">
          <AffiliateForm action={updateAffiliateAction.bind(null, affiliate.id)} initial={formValues(affiliate)} editing />
        </Section>
      </div>
    </>
  );
}
