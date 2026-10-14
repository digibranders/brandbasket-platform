import { listReferralCodes } from "@firstfold/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDate } from "@firstfold/shared/ui/panel/local-date-time";
import { TagIcon } from "@firstfold/shared/ui/icons";
import { describeReferralDiscount } from "@firstfold/shared/lib/billing/referral-value";
import { buttonPrimary } from "@/components/console/buttons";
import { Figures } from "@/components/console/figures";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusDot } from "@/components/console/status-dot";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Coupons" };

/** Enough to see at a glance; a longer history belongs in a report, not a console list. */
const LIST_LIMIT = 200;

/** Why a code cannot be redeemed right now, or null when it can. */
function retiredReason(
  code: { readonly active: boolean; readonly expiresAt: Date | null; readonly maxRedemptions: number | null },
  redemptions: number,
  now: Date,
): string | null {
  if (!code.active) return "Off";
  if (code.expiresAt !== null && code.expiresAt <= now) return "Expired";
  if (code.maxRedemptions !== null && redemptions >= code.maxRedemptions) return "Used up";
  return null;
}

export default async function CouponsPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const codes = await listReferralCodes(getStaffDb(), "coupon", LIST_LIMIT);
  const now = new Date();
  const usable = codes.filter((code) => retiredReason(code, code.redemptions, now) === null).length;
  const redemptions = codes.reduce((total, code) => total + code.redemptions, 0);

  return (
    <>
      <PageHeader
        title="Coupons"
        meta="A fixed amount or a percentage off every month. Nobody is paid for them."
        action={
          <Link href="/coupons/new" className={buttonPrimary}>
            New coupon
          </Link>
        }
      />

      <Figures
        items={[
          { value: codes.length, label: "Coupons" },
          { value: usable, label: "Usable now" },
          { value: redemptions, label: "Members using", emphasis: redemptions > 0 },
        ]}
      />

      {codes.length === 0 ? (
        <EmptyLine>No coupons yet.</EmptyLine>
      ) : (
        <div className="mt-6">
          <HairlineList label="Coupons">
            {codes.map((code) => {
              const retired = retiredReason(code, code.redemptions, now);
              return (
                <HairlineRow
                  key={code.id}
                  href={`/coupons/${code.id}`}
                  lead={
                    <span className="grid size-10 place-items-center rounded-full bg-paper-deep text-accent">
                      <TagIcon className="size-5" />
                    </span>
                  }
                  title={<span className="tracking-[0.06em]">{code.code}</span>}
                  sub={
                    <span className="block truncate">
                      {code.discount === null ? "No discount" : describeReferralDiscount(code.discount, code.currency)} ·{" "}
                      {code.currency}
                    </span>
                  }
                  meta={
                    <StatusDot
                      tone={retired === null ? "done" : "quiet"}
                      label={
                        retired ??
                        `${code.redemptions}${code.maxRedemptions === null ? "" : ` of ${code.maxRedemptions}`} used`
                      }
                    />
                  }
                  trail={<LocalDate iso={code.createdAt.toISOString()} />}
                />
              );
            })}
          </HairlineList>
        </div>
      )}
    </>
  );
}
