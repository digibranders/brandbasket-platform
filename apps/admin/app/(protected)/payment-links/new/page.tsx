import { listReferralCodes } from "@brandbasket/db";
import { countryOptions } from "@brandbasket/shared/lib/countries";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { PaymentLinkForm, type CouponChoice } from "@/components/payment-link-form";
import { getStaffDb } from "@/lib/server/db";
import { activeProviderName, loadPaymentLinkPrefill } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { createPaymentLinkAction } from "./actions";

export const metadata: Metadata = { title: "New payment link" };

/** Enough coupons to choose from; a console that has more than this has bigger problems than this list. */
const COUPON_LIMIT = 200;

function oneOf(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" ? null : first;
}

export default async function NewPaymentLinkPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactElement> {
  await requireStaffCan("money");
  const query = await searchParams;
  const now = new Date();
  const prefill = await loadPaymentLinkPrefill({ leadId: oneOf(query.lead), businessId: oneOf(query.business), now });
  const coupons = (await listReferralCodes(getStaffDb(), "coupon", COUPON_LIMIT)).flatMap((code): CouponChoice[] =>
    code.discount === null || !code.active || (code.expiresAt !== null && code.expiresAt <= now)
      ? []
      : [{ id: code.id, code: code.code, currency: code.currency, discount: code.discount, discountMonths: code.discountMonths }],
  );

  return (
    <>
      <PageHeader
        back={{ href: "/payment-links", label: "Payment links" }}
        title={
          <>
            New <em>payment link.</em>
          </>
        }
        meta="A single-use address the customer opens to pay, with the deal already in place."
      />
      <div className="mt-10 border-t border-line pt-10">
        {prefill.blocked === null ? (
          <PaymentLinkForm
            action={createPaymentLinkAction.bind(null, { leadId: prefill.leadId, businessId: prefill.businessId })}
            prefill={prefill.values}
            countries={countryOptions().map((country) => ({ value: country.code, label: country.name }))}
            coupons={coupons}
            provider={activeProviderName()}
          />
        ) : (
          <Notice tone="problem">{prefill.blocked}</Notice>
        )}
      </div>
    </>
  );
}
