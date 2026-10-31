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
import { CheckCircle, Coins, HourglassMedium, Plus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { describeDiscountMonths, describeReferralDiscount, formatPercent } from "@brandbasket/shared/lib/billing/referral-value";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { AffiliateForm, CancelEarningButton, PayoutForm, type AffiliateFormValues } from "@/components/affiliate-forms";
import { AffiliateLoginLink } from "@/components/affiliate-login-link";
import { Avatar } from "@/components/console/avatar";
import { buttonSecondary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import {
  PANEL_TABLE,
  PANEL_TD,
  PANEL_TD_NUM,
  PANEL_TD_TIME,
  PANEL_TH,
  PANEL_TH_NUM,
  Panel,
  PanelEmpty,
  StatCard,
} from "@/components/console/panel";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { describeAffiliateReward, describeRewardCycles, findAffiliate, payoutToday } from "@/lib/server/affiliate-admin";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { cancelEarningAction, emailLoginLinkAction, issueLoginLinkAction, recordPayoutAction, updateAffiliateAction } from "./actions";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Affiliate" };

const LIST_LIMIT = 200;

interface AffiliatePageProps {
  readonly params: Promise<{ readonly affiliateId: string }>;
  /** `mail` is set by the new-affiliate form's redirect: whether their sign-in link was emailed. */
  readonly searchParams: Promise<{ readonly mail?: string }>;
}

const EARNING_TONE: Readonly<Record<AffiliateEarningStatus, PillTone>> = {
  owed: "wait",
  paid: "done",
  cancelled: "todo",
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
export default async function AffiliatePage({ params, searchParams }: AffiliatePageProps): Promise<ReactElement> {
  const { user } = await requireStaffCan("money");
  const { affiliateId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "affiliates.detail", targetType: "affiliate", targetId: affiliateId });
  const { mail } = await searchParams;
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
  const contactLine = [displayPhoneText(affiliate.phone), affiliate.email]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const owedFigure = owing.length === 0 ? "₹0" : owing.map((total) => formatMoney(total.owedCents, total.currency)).join(" + ");
  const paidFigure =
    totals.length === 0 ? "₹0" : totals.map((total) => formatMoney(total.paidCents, total.currency)).join(" + ");

  return (
    <>
      <PageHeader
        back={{ href: "/affiliates", label: "Affiliates" }}
        lead={<Avatar id={affiliate.id} name={affiliate.name} size="lg" />}
        title={affiliate.name}
        meta={
          <>
            {contactLine === "" ? null : <>{contactLine} </>}
            <StatusPill tone={affiliate.active ? "done" : "todo"}>{affiliate.active ? "Active" : "Off"}</StatusPill>
          </>
        }
      />

      {mail === "sent" && affiliate.email !== null ? (
        <Notice tone="ok" className="mt-6">
          Their sign-in link was emailed to {affiliate.email}.
        </Notice>
      ) : null}
      {mail === "failed" ? (
        <Notice tone="problem" className="mt-6">
          They were added, but the sign-in email could not be sent. Use Email the link under Sign-in to try again.
        </Notice>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Earns"
          value={describeAffiliateReward(affiliate)}
          note={describeRewardCycles(affiliate.rewardCycles)}
          icon={<Coins className="size-4" weight="regular" />}
          long
        />
        <StatCard label="Members" value={members.length} icon={<UsersThree className="size-4" weight="regular" />} />
        <StatCard label="Owed" value={owedFigure} icon={<HourglassMedium className="size-4" weight="regular" />} emphasis={owing.length > 0} long />
        <StatCard label="Paid" value={paidFigure} icon={<CheckCircle className="size-4" weight="regular" />} long />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-6">
          {owing.length === 0 ? null : (
            <Panel title="Pay out" description="After the bank or UPI transfer" tone="attention">
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
            </Panel>
          )}

          <Panel
            title="Codes"
            count={codes.length === 0 ? undefined : codes.length}
            flush
            action={
              <Link href={`/affiliates/${affiliate.id}/codes/new`} className={buttonSecondary}>
                <Plus className="size-4" aria-hidden="true" />
                Add code
              </Link>
            }
          >
            {codes.length === 0 ? (
              <PanelEmpty>No codes yet. Add one to share.</PanelEmpty>
            ) : (
              <div className="overflow-x-auto">
                <TableScroll label="Codes">
                  <table className={PANEL_TABLE}>
                    <thead>
                      <tr>
                        <th scope="col" className={PANEL_TH}>Code</th>
                        <th scope="col" className={PANEL_TH}>Discount</th>
                        <th scope="col" className={PANEL_TH}>Currency</th>
                        <th scope="col" className={PANEL_TH_NUM}>Used</th>
                        <th scope="col" className={PANEL_TH}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((code) => {
                        const working = code.active && affiliate.active;
                        return (
                          <tr key={code.id}>
                            <td className={PANEL_TD}>
                              <Link href={`/coupons/${code.id}`} className="font-semibold tracking-[0.06em] text-ink underline-offset-4 hover:underline">
                                {code.code}
                              </Link>
                            </td>
                            <td className={PANEL_TD}>
                              {code.discount === null ? (
                                <span className="text-ink-2">No discount</span>
                              ) : (
                                <>
                                  {describeReferralDiscount(code.discount, code.currency)}
                                  <span className="block text-xs text-ink-2">{describeDiscountMonths(code.discountMonths)}</span>
                                </>
                              )}
                            </td>
                            <td className={PANEL_TD_TIME}>{code.currency}</td>
                            <td className={PANEL_TD_NUM}>{code.redemptions}</td>
                            <td className={PANEL_TD}>
                              <StatusPill tone={working ? "done" : "todo"}>{working ? "Active" : "Off"}</StatusPill>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            )}
          </Panel>

          <Panel title="Earnings" count={earnings.length === 0 ? undefined : earnings.length} flush>
            {earnings.length === 0 ? (
              <PanelEmpty>Nothing earned yet.</PanelEmpty>
            ) : (
              <div className="overflow-x-auto">
                <TableScroll label="Earnings">
                  <table className={PANEL_TABLE}>
                    <thead>
                      <tr>
                        <th scope="col" className={PANEL_TH}>Date</th>
                        <th scope="col" className={PANEL_TH}>Member</th>
                        <th scope="col" className={PANEL_TH_NUM}>Amount</th>
                        <th scope="col" className={PANEL_TH}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map((earning) => (
                        <tr key={earning.id}>
                          <td className={PANEL_TD_TIME}>
                            <LocalDate iso={earning.createdAt.toISOString()} />
                          </td>
                          <td className={PANEL_TD}>
                            <span className="block max-w-[16rem] truncate font-semibold">{earning.businessName}</span>
                            <span className="block text-xs text-ink-2">
                              {earning.code} · Month {earning.cycleNumber}
                              {affiliate.rewardCycles === null ? "" : ` of ${affiliate.rewardCycles}`}
                            </span>
                          </td>
                          <td className={PANEL_TD_NUM}>{formatMoney(earning.amountCents, earning.currency)}</td>
                          <td className={PANEL_TD}>
                            <span className="flex items-center gap-3">
                              <StatusPill tone={EARNING_TONE[earning.status]}>{EARNING_LABEL[earning.status]}</StatusPill>
                              {earning.status === "owed" ? <CancelEarningButton action={cancelEarningAction.bind(null, affiliate.id, earning.id)} /> : null}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            )}
          </Panel>

          <Panel title="Members" count={members.length === 0 ? undefined : members.length} flush>
            {members.length === 0 ? (
              <PanelEmpty>Nobody yet.</PanelEmpty>
            ) : (
              <div className="overflow-x-auto">
                <TableScroll label="Members">
                  <table className={PANEL_TABLE}>
                    <thead>
                      <tr>
                        <th scope="col" className={PANEL_TH}>Business</th>
                        <th scope="col" className={PANEL_TH}>Code</th>
                        <th scope="col" className={PANEL_TH}>Since</th>
                        <th scope="col" className={PANEL_TH}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.businessId}>
                          <td className={PANEL_TD}>
                            <Link href={`/clients/${member.businessId}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                              {member.businessName}
                            </Link>
                          </td>
                          <td className={`${PANEL_TD} tracking-[0.06em]`}>{member.code}</td>
                          <td className={PANEL_TD_TIME}>
                            <LocalDate iso={member.since.toISOString()} />
                          </td>
                          <td className={PANEL_TD}>
                            <StatusPill tone={member.status === "active" ? "done" : "todo"}>{member.status === "active" ? "Paying" : "Stopped"}</StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            )}
          </Panel>

          {payouts.length === 0 ? null : (
            <Panel title="Payouts" count={payouts.length} flush>
              <div className="overflow-x-auto">
                <TableScroll label="Payouts">
                  <table className={PANEL_TABLE}>
                    <thead>
                      <tr>
                        <th scope="col" className={PANEL_TH}>Paid on</th>
                        <th scope="col" className={PANEL_TH}>Reference</th>
                        <th scope="col" className={PANEL_TH_NUM}>Months</th>
                        <th scope="col" className={PANEL_TH_NUM}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout) => (
                        <tr key={payout.id}>
                          <td className={PANEL_TD_TIME}>{payout.paidOn}</td>
                          <td className={PANEL_TD}>
                            <span className="block max-w-[16rem] truncate">{payout.reference}</span>
                            {payout.withheldCents === 0 ? null : (
                              <span className="block truncate text-xs tabular-nums text-ink-2">
                                {formatMoney(payout.withheldCents, payout.currency)} withheld · {payout.withheldReason}
                              </span>
                            )}
                          </td>
                          <td className={PANEL_TD_NUM}>{payout.earnings}</td>
                          <td className={PANEL_TD_NUM}>{formatMoney(payout.amountCents, payout.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Sign-in" description={login?.signedUp === true ? "They have their own dashboard" : "How they open their own dashboard"}>
            <AffiliateLoginLink
              action={issueLoginLinkAction.bind(null, affiliate.id)}
              emailAction={emailLoginLinkAction.bind(null, affiliate.id)}
              emailTo={affiliate.email}
              signedUp={login?.signedUp ?? false}
              linkExpiresAt={login?.linkExpiresAt?.toISOString() ?? null}
            />
          </Panel>

          <Panel title="Details">
            <AffiliateForm action={updateAffiliateAction.bind(null, affiliate.id)} initial={formValues(affiliate)} editing />
          </Panel>
        </div>
      </div>
    </>
  );
}
