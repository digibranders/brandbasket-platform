import { listAffiliates, type AffiliateTotals } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LinkIcon } from "@fynix/shared/ui/icons";
import { formatMoney } from "@fynix/shared/lib/money";
import { buttonPrimary } from "@/components/console/buttons";
import { Figures } from "@/components/console/figures";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusDot } from "@/components/console/status-dot";
import { describeAffiliateReward, describeRewardCycles } from "@/lib/server/affiliate-admin";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Affiliates" };

const LIST_LIMIT = 200;

/** "₹400 owed · ₹1,200 paid", one currency after another; "Nothing yet" before any earning. */
function moneyLine(totals: readonly AffiliateTotals[]): string {
  if (totals.length === 0) return "Nothing earned yet";
  return totals
    .map((total) => `${formatMoney(total.owedCents, total.currency)} owed · ${formatMoney(total.paidCents, total.currency)} paid`)
    .join("  ·  ");
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
  await requireStaffAccess();
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
            New affiliate
          </Link>
        }
      />

      <Figures
        items={[
          { value: affiliates.length, label: "Affiliates" },
          { value: members, label: "Members brought" },
          { value: owed, label: "Owed now", emphasis: owed !== "₹0" },
        ]}
      />

      {affiliates.length === 0 ? (
        <EmptyLine>No affiliates yet.</EmptyLine>
      ) : (
        <div className="mt-6">
          <HairlineList label="Affiliates">
            {affiliates.map((affiliate) => (
              <HairlineRow
                key={affiliate.id}
                href={`/affiliates/${affiliate.id}`}
                lead={
                  <span className="grid size-10 place-items-center rounded-full bg-paper-deep text-accent">
                    <LinkIcon className="size-5" />
                  </span>
                }
                title={affiliate.name}
                sub={
                  <>
                    <span className="block truncate">
                      {describeAffiliateReward(affiliate)}
                      {affiliate.rewardCycles === null ? "" : ` · ${describeRewardCycles(affiliate.rewardCycles)}`}
                    </span>
                    <span className="block truncate tabular-nums">{moneyLine(affiliate.totals)}</span>
                    <span className="block truncate">{affiliate.signedUp ? "Has a sign-in" : "No sign-in yet"}</span>
                  </>
                }
                meta={
                  <StatusDot
                    tone={affiliate.active ? "done" : "quiet"}
                    label={affiliate.active ? `${affiliate.members} ${affiliate.members === 1 ? "member" : "members"}` : "Off"}
                  />
                }
              />
            ))}
          </HairlineList>
        </div>
      )}
    </>
  );
}
