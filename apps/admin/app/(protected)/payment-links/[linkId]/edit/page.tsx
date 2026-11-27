import { listReferralCodes } from "@brandbasket/db";
import { countryOptions } from "@brandbasket/shared/lib/countries";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { PaymentLinkForm, type CouponChoice } from "@/components/payment-link-form";
import { getStaffDb } from "@/lib/server/db";
import { activeProviderName, loadDealEditPage } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { editDealAction } from "./actions";

export const metadata: Metadata = { title: "Edit deal" };

/** Enough coupons to choose from; the same limit the new link page uses. */
const COUPON_LIMIT = 200;

export default async function EditDealPage({ params }: { readonly params: Promise<{ readonly linkId: string }> }): Promise<ReactElement> {
  await requireStaffCan("money");
  const { linkId } = await params;
  const now = new Date();
  const page = await loadDealEditPage(linkId, now);
  if (page === null) return notFound();
  const { link } = page;
  const coupons = (await listReferralCodes(getStaffDb(), "coupon", COUPON_LIMIT)).flatMap((code): CouponChoice[] =>
    code.discount === null || !code.active || (code.expiresAt !== null && code.expiresAt <= now)
      ? []
      : [{ id: code.id, code: code.code, currency: code.currency, discount: code.discount, discountMonths: code.discountMonths }],
  );
  const back = link.businessId === null ? { href: "/payment-links", label: "Payment links" } : { href: `/clients/${link.businessId}/billing`, label: "Billing" };

  return (
    <>
      <PageHeader
        back={back}
        title={
          <>
            Edit <em>deal.</em>
          </>
        }
        meta={`${link.businessName ?? link.contactName ?? "Deal"}: change the services, prices and build price while the website is being built.`}
      />
      <div className="mt-10 border-t border-line pt-10">
        {page.blocked === null && link.advanceCents !== null ? (
          <PaymentLinkForm
            action={editDealAction.bind(null, link.id)}
            prefill={page.values}
            countries={countryOptions().map((country) => ({ value: country.code, label: country.name }))}
            coupons={coupons}
            provider={activeProviderName()}
            editing={{ advanceCents: link.advanceCents }}
          />
        ) : (
          <Notice tone="problem">{page.blocked ?? "Only a paid deal can be edited."}</Notice>
        )}
      </div>
    </>
  );
}
