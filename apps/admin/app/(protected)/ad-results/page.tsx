import { listAdFunnelData } from "@brandbasket/db";
import { buildAdFunnel } from "@brandbasket/shared/lib/ad-funnel";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { TABLE, TD, TD_NUM, TH } from "@/components/console/table";
import { TableScroll } from "@/components/console/table-scroll";
import { AD_RESULTS_WINDOWS, adResultsHref, adResultsWindow, readAdResultsDays } from "@/lib/ad-results";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";

export const metadata: Metadata = { title: "Ad results" };

interface AdResultsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The money in a row: rupees and dollars are never added together, so each shows on its own when there is any. */
function moneyCell(inrCents: number, usdCents: number): string {
  const parts = [inrCents > 0 ? formatMoney(inrCents, "INR") : null, usdCents > 0 ? formatMoney(usdCents, "USD") : null].filter((part) => part !== null);
  return parts.length === 0 ? "-" : parts.join(" + ");
}

/**
 * What the ads brought (plan 59): for each source, medium, campaign and ad, the people who left their details on the ad landing
 * page, the accounts they opened, how many paid, and the money from their first payments without GST. Accounts and payments
 * are counted by when the account was opened, so a campaign's row is a group of people followed to payment, not a day's takings.
 * Leads are matched to a campaign by the line the ad page leaves on the enquiry. Finance and admin only.
 */
export default async function AdResultsPage({ searchParams }: AdResultsPageProps): Promise<ReactElement> {
  await requireStaffCan("money");
  const days = readAdResultsDays(await searchParams);
  const { from, to } = adResultsWindow(new Date(), days);
  const rows = buildAdFunnel(await listAdFunnelData(getStaffDb(), from, to));
  const total = rows.reduce((sum, row) => ({ leads: sum.leads + row.leads, accounts: sum.accounts + row.accounts, paid: sum.paid + row.paid }), { leads: 0, accounts: 0, paid: 0 });

  return (
    <>
      <PageHeader title="Ad results" meta={`Last ${String(days)} days · ${String(total.leads)} leads · ${String(total.accounts)} accounts · ${String(total.paid)} paid`} />
      <div className="mt-6">
        <FilterPills
          label="Choose the period"
          options={AD_RESULTS_WINDOWS.map((window) => ({ href: adResultsHref(window), label: `${String(window)} days`, current: window === days }))}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyLine>No one has come from an ad in this period.</EmptyLine>
      ) : (
        <TableScroll label="Ad results by campaign">
          <table className={`${TABLE} mt-6`}>
            <thead>
              <tr>
                <th className={TH}>Source</th>
                <th className={TH}>Medium</th>
                <th className={TH}>Campaign</th>
                <th className={TH}>Ad</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Accounts</th>
                <th className={`${TH} text-right`}>Paid</th>
                <th className={`${TH} text-right`}>First payments, without GST</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={[row.source, row.medium, row.campaign, row.content].join("|")}>
                  <td className={TD}>{row.source}</td>
                  <td className={TD}>{row.medium}</td>
                  <td className={TD}>{row.campaign}</td>
                  <td className={TD}>{row.content}</td>
                  <td className={TD_NUM}>{row.leads}</td>
                  <td className={TD_NUM}>{row.accounts}</td>
                  <td className={TD_NUM}>{row.paid}</td>
                  <td className={TD_NUM}>{moneyCell(row.revenueInrCents, row.revenueUsdCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}
