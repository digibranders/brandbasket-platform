import {
  countReferralRedemptions,
  countReferralSubscriptions,
  findAffiliateById,
  findReferralCodeById,
  listReferralRedemptions,
} from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { describeReferralDiscount, formatPercent } from "@brandbasket/shared/lib/billing/referral-value";
import { DeleteReferralCodeForm, RetireReferralCodeForm } from "@/components/referral-code-form";
import { Figures } from "@/components/console/figures";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { StatusDot } from "@/components/console/status-dot";
import { getStaffDb } from "@/lib/server/db";
import { referralWorth } from "@/lib/server/referral-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { retireReferralCodeAction } from "./actions";
import { deleteReferralCodeAction } from "./delete-actions";

export const metadata: Metadata = { title: "Code" };

const REDEMPTION_LIMIT = 200;

interface CodePageProps {
  readonly params: Promise<{ readonly codeId: string }>;
}

/** A timestamp as the `YYYY-MM-DD` a date input wants, in UTC, the same zone the expiry was stored in. */
function dateInputValue(when: Date | null): string {
  return when === null ? "" : when.toISOString().slice(0, 10);
}

/** One code, a coupon or an affiliate's: what it means in money today, who is on it, and what may still change. */
export default async function CodePage({ params }: CodePageProps): Promise<ReactElement> {
  await requireStaffAccess();
  const { codeId } = await params;
  const staffDb = getStaffDb();
  const code = await findReferralCodeById(staffDb, codeId);
  if (code === null) notFound();

  const [redemptions, subscriptionsOnIt, redeemedBy, worth, affiliate] = await Promise.all([
    countReferralRedemptions(staffDb, code.id),
    // What actually blocks deleting it: an open, unpaid checkout holds the row too.
    countReferralSubscriptions(staffDb, code.id),
    listReferralRedemptions(staffDb, code.id, REDEMPTION_LIMIT),
    referralWorth(code),
    code.affiliateId === null ? Promise.resolve(null) : findAffiliateById(staffDb, code.affiliateId),
  ]);
  const back =
    affiliate === null ? { href: "/coupons", label: "Coupons" } : { href: `/affiliates/${affiliate.id}`, label: affiliate.name };
  const gst = worth !== null && worth.taxRateBasisPoints !== 0;
  // A code works only while it, and its affiliate if it has one, are both on.
  const status = !code.active ? "Off" : affiliate !== null && !affiliate.active ? "Affiliate off" : "Active";

  return (
    <>
      <PageHeader
        back={back}
        title={<span className="tracking-[0.04em]">{code.code}</span>}
        meta={
          <>
            {affiliate === null ? "Coupon" : `${affiliate.name}’s code`} · {BILLING_CURRENCY_LABELS[code.currency]} ·{" "}
            <StatusDot tone={status === "Active" ? "done" : "quiet"} label={status} className="align-middle" />
          </>
        }
      />

      {worth === null ? (
        <p className="mt-8 max-w-2xl border-l-2 border-accent py-1 pl-4 text-accent">
          No active {code.currency} plan this can be charged against.
        </p>
      ) : (
        <Figures
          items={[
            {
              value: formatMoney(worth.customerPaysCents, code.currency),
              label: "Member pays",
              note: `a month${gst ? " with GST" : ""}`,
            },
            {
              value:
                code.discount === null
                  ? "None"
                  : code.discount.kind === "percent"
                    ? formatPercent(code.discount.basisPoints)
                    : formatMoney(worth.discountCents, code.currency),
              label: "Discount",
              note:
                code.discount === null
                  ? "full price"
                  : `${formatMoney(worth.discountCents, code.currency)} off${gst ? " before GST" : ""}`,
            },
            {
              value: `${redemptions}${code.maxRedemptions === null ? "" : ` / ${code.maxRedemptions}`}`,
              label: "Members",
              emphasis: redemptions > 0,
            },
          ]}
        />
      )}

      <div className="mt-12">
        <Section title="Members" aside={code.discount === null ? undefined : describeReferralDiscount(code.discount, code.currency)}>
          {redeemedBy.length === 0 ? (
            <EmptyLine>Nobody yet.</EmptyLine>
          ) : (
            <HairlineList label="Members on this code">
              {redeemedBy.map((redemption) => (
                <HairlineRow
                  key={redemption.subscriptionId}
                  href={`/clients/${redemption.businessId}`}
                  title={redemption.businessName}
                  sub={
                    redemption.discountAmountCents === 0
                      ? "Full price"
                      : `${formatMoney(redemption.discountAmountCents, code.currency)} off`
                  }
                  trail={redemption.activatedAt === null ? null : <LocalDate iso={redemption.activatedAt.toISOString()} />}
                />
              ))}
            </HairlineList>
          )}
        </Section>

        <Section title="Settings">
          <div className="max-w-xl">
            <RetireReferralCodeForm
              action={retireReferralCodeAction.bind(null, code.id)}
              active={code.active}
              expiresOn={dateInputValue(code.expiresAt)}
              maxRedemptions={code.maxRedemptions === null ? "" : String(code.maxRedemptions)}
            />
          </div>
        </Section>

        <Section title="Delete">
          <div className="max-w-xl">
            <DeleteReferralCodeForm
              action={deleteReferralCodeAction.bind(null, code.id)}
              code={code.code}
              redeemed={subscriptionsOnIt > 0}
            />
          </div>
        </Section>

        {affiliate === null ? null : (
          <p className="mt-10 text-sm text-ink-soft">
            Earnings for this code are on{" "}
            <Link href={`/affiliates/${affiliate.id}`} className="link-underline text-ink">
              {affiliate.name}’s page
            </Link>
            .
          </p>
        )}
      </div>
    </>
  );
}
