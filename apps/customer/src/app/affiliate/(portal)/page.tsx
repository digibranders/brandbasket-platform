import { describeAffiliateReward, describeRewardCycles } from "@brandbasket/shared/lib/billing/referral-value";
import type { Metadata } from "next";
import { PageHeader } from "@/components";
import { AffiliateDashboard } from "@/features/affiliate/components/affiliate-dashboard";
import { firstNameOf, rewardLine } from "@/features/affiliate/rules/dashboard";
import { EARNING_LIMIT, loadCodes, loadEarnings, loadFigures, loadMonthly, loadPayouts, MONTHS_SHOWN, PAYOUT_LIMIT } from "@/features/affiliate/server/dashboard";
import { requireAffiliate } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const metadata: Metadata = { title: "My coupon" };

// Never cached: it is one person's money, read fresh on every visit.
export const dynamic = "force-dynamic";

/** The affiliate's dashboard. For the signed-in affiliate and nobody else: the guard finds them from the session. */
export default async function AffiliatePage() {
  const { user, affiliate } = await requireAffiliate();
  const now = new Date();
  const [codes, figures, monthly, earnings, payouts] = await Promise.all([
    load("affiliate.codes", () => loadCodes(affiliate)),
    load("affiliate.figures", () => loadFigures(affiliate)),
    load("affiliate.monthly", () => loadMonthly(affiliate, now)),
    load("affiliate.earnings", () => loadEarnings(affiliate)),
    load("affiliate.payouts", () => loadPayouts(affiliate)),
  ]);
  return (
    <>
      <PageHeader title={`Hello, ${firstNameOf(user.name)}.`} description={rewardLine(describeAffiliateReward(affiliate), describeRewardCycles(affiliate.rewardCycles))} />
      <AffiliateDashboard
        affiliate={affiliate}
        now={now}
        codes={codes}
        figures={figures}
        monthly={monthly}
        earnings={earnings}
        payouts={payouts}
        monthsShown={MONTHS_SHOWN}
        earningLimit={EARNING_LIMIT}
        payoutLimit={PAYOUT_LIMIT}
      />
    </>
  );
}
