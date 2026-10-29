import { listAffiliates, type AffiliateTotals } from "@brandbasket/db";
import { Handshake, HourglassMedium, Plus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { buttonPrimary } from "@/components/console/buttons";
import { Avatar } from "@/components/console/avatar";
import { PageHeader } from "@/components/console/page-header";
import {
  PANEL_TABLE,
  PANEL_TD,
  PANEL_TD_NUM,
  PANEL_TH,
  PANEL_TH_NUM,
  Panel,
  PanelEmpty,
  StatCard,
} from "@/components/console/panel";
import { StatusPill } from "@/components/console/status-pill";
import { describeAffiliateReward, describeRewardCycles } from "@/lib/server/affiliate-admin";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Affiliates" };

const LIST_LIMIT = 200;

/** One figure per currency, added together: "₹400 + $12"; "₹0" before any money. */
function money(totals: readonly AffiliateTotals[], pick: "owedCents" | "paidCents"): string {
  const parts = totals.filter((total) => total[pick] > 0).map((total) => formatMoney(total[pick], total.currency));
  return parts.length === 0 ? "₹0" : parts.join(" + ");
}

/** What everyone is owed, per currency, for the figure at the top. */
function owedByCurrency(rows: readonly { readonly totals: readonly AffiliateTotals[] }[]): string {
  const owed = new Map<AffiliateTotals["currency"], number>();
  for (const row of rows) {
    for (const total of row.totals) owed.set(total.currency, (owed.get(total.currency) ?? 0) + total.owedCents);
  }
  const nonZero = [...owed].filter(([, cents]) => cents > 0);
  return nonZero.length === 0 ? "₹0" : nonZero.map(([currency, cents]) => formatMoney(cents, currency)).join(" + ");
}

export default async function AffiliatesPage(): Promise<ReactElement> {
  await requireStaffCan("money");
  const affiliates = await listAffiliates(getStaffDb(), LIST_LIMIT);
  const members = affiliates.reduce((total, affiliate) => total + affiliate.members, 0);
  const owed = owedByCurrency(affiliates);

  return (
    <>
      <PageHeader
        title="Affiliates"
        meta="People we pay for every month a member they brought pays."
        action={
          <Link href="/affiliates/new" className={buttonPrimary}>
            <Plus className="size-4" aria-hidden="true" />
            New affiliate
          </Link>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Affiliates" value={affiliates.length} icon={<Handshake className="size-4" weight="regular" />} />
        <StatCard label="Members brought" value={members} icon={<UsersThree className="size-4" weight="regular" />} />
        <StatCard label="Owed now" value={owed} icon={<HourglassMedium className="size-4" weight="regular" />} emphasis={owed !== "₹0"} long />
      </div>

      <div className="mt-6">
        <Panel title="All affiliates" count={affiliates.length === 0 ? undefined : affiliates.length} flush>
          {affiliates.length === 0 ? (
            <PanelEmpty>No affiliates yet.</PanelEmpty>
          ) : (
            <div className="overflow-x-auto">
              <TableScroll label="All affiliates">
                <table className={PANEL_TABLE}>
                  <thead>
                    <tr>
                      <th scope="col" className={PANEL_TH}>Affiliate</th>
                      <th scope="col" className={PANEL_TH}>Earns</th>
                      <th scope="col" className={PANEL_TH_NUM}>Members</th>
                      <th scope="col" className={PANEL_TH_NUM}>Owed</th>
                      <th scope="col" className={PANEL_TH_NUM}>Paid</th>
                      <th scope="col" className={PANEL_TH}>Sign-in</th>
                      <th scope="col" className={PANEL_TH}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliates.map((affiliate) => {
                      const owedFigure = money(affiliate.totals, "owedCents");
                      return (
                        <tr key={affiliate.id} className="relative transition-colors duration-200 hover:bg-sunken/40">
                          <td className={PANEL_TD}>
                            <span className="flex items-center gap-3">
                              <Avatar id={affiliate.id} name={affiliate.name} size="sm" />
                              <span className="min-w-0">
                                <Link href={`/affiliates/${affiliate.id}`} className="block truncate font-semibold text-ink after:absolute after:inset-0">
                                  {affiliate.name}
                                </Link>
                                <span className="block max-w-[14rem] truncate text-xs text-ink-2">{affiliate.email ?? displayPhoneText(affiliate.phone)}</span>
                              </span>
                            </span>
                          </td>
                          <td className={PANEL_TD}>
                            {describeAffiliateReward(affiliate)}
                            {affiliate.rewardCycles === null ? null : <span className="block text-xs text-ink-2">{describeRewardCycles(affiliate.rewardCycles)}</span>}
                          </td>
                          <td className={PANEL_TD_NUM}>{affiliate.members}</td>
                          <td className={`${PANEL_TD_NUM} ${owedFigure === "₹0" ? "" : "text-rattan-text"}`}>{owedFigure}</td>
                          <td className={PANEL_TD_NUM}>{money(affiliate.totals, "paidCents")}</td>
                          <td className={PANEL_TD}>
                            <StatusPill tone={affiliate.signedUp ? "done" : "todo"}>{affiliate.signedUp ? "Has a sign-in" : "No sign-in yet"}</StatusPill>
                          </td>
                          <td className={PANEL_TD}>
                            <StatusPill tone={affiliate.active ? "done" : "todo"}>{affiliate.active ? "Active" : "Off"}</StatusPill>
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
      </div>
    </>
  );
}
