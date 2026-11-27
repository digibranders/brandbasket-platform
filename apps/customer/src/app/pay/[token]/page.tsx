import { isWebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { turnstileSiteKey } from "@brandbasket/shared/server/turnstile-request";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignupCheckoutScreen } from "@/features/checkout/components/signup-checkout-screen";
import type { DetailsPrefill } from "@/features/checkout/components/details-fields";
import { getEntryAccess } from "@/features/entry/server/entry-access";
import { loadSignupCheckoutBasketFor } from "@/features/entry/server/signup-checkout-basket";
import { LinkGone, LinkSignIn } from "@/features/paylink/components/link-notice";
import { lookUpDealLink, lookUpPaymentLink } from "@/features/paylink/server/link";

export const metadata: Metadata = { title: "Payment link", robots: { index: false, follow: false } };

// Never cached: it reads the link's state and the session.
export const dynamic = "force-dynamic";

/** What staff knew about the customer, as the details form opens with it. India's ten-digit mobile numbers only: any other is typed. */
function prefillOf(link: Awaited<ReturnType<typeof lookUpPaymentLink>> & { kind: "open" }): DetailsPrefill {
  const { link: l } = link;
  const phone = (l.phone ?? "").replace(/\D/g, "");
  return {
    name: l.contactName ?? "",
    email: l.email ?? "",
    phone: l.countryCode === "IN" && /^\d{10}$/.test(phone) ? phone : "",
    ...(l.businessName === null ? {} : { businessName: l.businessName }),
    ...(l.stateCode === null ? {} : { stateCode: l.stateCode }),
    ...(l.gstin === null ? {} : { gstin: l.gstin }),
    ...(l.legalName === null ? {} : { legalName: l.legalName }),
    ...(l.addressLine1 === null ? {} : { addressLine1: l.addressLine1 }),
    ...(l.addressLine2 === null ? {} : { addressLine2: l.addressLine2 }),
    ...(l.postalCode === null ? {} : { postalCode: l.postalCode }),
    ...(l.city === null ? {} : { city: l.city }),
  };
}

/**
 * A payment link staff sent after agreeing a deal (docs/plans/65). Public: the token in the address is the credential. For a new
 * customer it opens the pay-first checkout with the details filled in and the deal locked; the account is made as the payment starts.
 * For an account that signed up and never paid it asks them to sign in (the checkout then reads the link bound to their business); a
 * visitor already signed in to that account goes straight to checkout. A link that is cancelled, expired or paid says only that it no
 * longer works.
 */
export default async function PayLinkPage({ params }: { readonly params: Promise<{ readonly token: string }> }) {
  const { token } = await params;
  const found = await lookUpPaymentLink(token, new Date());
  if (found.kind === "gone") {
    // Plan 66: a deal being built has nothing left to pay from this address. Its owner goes Home; anyone else is told it no longer works.
    const deal = await lookUpDealLink(token, new Date());
    if (deal?.businessId != null) {
      const access = await getEntryAccess();
      if (access.kind === "granted" && access.tenant.businessId === deal.businessId) redirect("/");
    }
    return <LinkGone />;
  }
  const { link } = found;

  if (link.businessId !== null) {
    const access = await getEntryAccess();
    if (access.kind === "granted" && access.tenant.businessId === link.businessId) redirect("/checkout");
    return <LinkSignIn />;
  }

  const requestHeaders = await headers();
  const phoneCountries = phoneCountryOptions().map((option) => ({ code: option.code, label: `${option.name} ${option.dialCode}`, dialCode: option.dialCode }));
  return (
    <SignupCheckoutScreen
      account="new"
      table={loadSignupCheckoutBasketFor(link.currency)}
      initialServices={link.services}
      initialKind={link.websiteKind !== null && isWebsiteKind(link.websiteKind) ? link.websiteKind : "b2b"}
      link={{
        interval: link.billingInterval === "year" ? "year" : "month",
        discountCents: link.setupFeeDiscountCents ?? 0,
        note: link.setupFeeNote,
        // A paid deal (plan 66) is paid as an advance first: the screen shows the agreed build price and the advance.
        ...(link.dealType === "paid" && link.setupFeeListCents !== null && link.advanceCents !== null ? { listCents: link.setupFeeListCents, advanceCents: link.advanceCents } : {}),
      }}
      payLinkToken={token}
      details={{
        siteKey: turnstileSiteKey(),
        phoneCountries,
        defaultPhoneCountry: visitorPhoneCountry(requestHeaders),
        prefill: prefillOf(found),
        startToken: null,
      }}
    />
  );
}
