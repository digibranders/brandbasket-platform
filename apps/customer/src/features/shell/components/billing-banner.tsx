"use client";

import { usePathname } from "next/navigation";
import { formatDate } from "@/lib/format";
import { Banner, LinkButton } from "@/ui";
import { SHELL_PATHS, showsBillingBanner, type BillingBannerState } from "../rules";

/**
 * The billing banner on every signed-in page but Home (plan 60, section 13; apps/platform billing-banner.tsx). It cannot be
 * dismissed: it goes when billing is sorted. Read access stays meanwhile.
 */
export function BillingBanner({ state }: { readonly state: BillingBannerState }) {
  const pathname = usePathname();
  if (state === null || !showsBillingBanner(pathname)) return null;
  switch (state.kind) {
    case "lapsed":
      return (
        <Banner tone="warn" action={<LinkButton href={SHELL_PATHS.billing} size="sm">Reactivate</LinkButton>} className="mb-4">
          <strong className="font-semibold">Your plan has ended.</strong> Your website and content are safe. Restart it from Plan & billing.
        </Banner>
      );
    case "renewal-failing":
      return (
        <Banner tone="warn" action={<LinkButton href={SHELL_PATHS.billing} size="sm">See billing</LinkButton>} className="mb-4">
          <strong className="font-semibold">We could not take your last payment.</strong> We will try again. Your website stays online until{" "}
          {formatDate(state.until)}; if the payments keep failing, it goes offline then.
        </Banner>
      );
    case "under-review":
      return (
        <Banner tone="info" className="mb-4">
          <strong className="font-semibold">Payment received.</strong> Our team will be in touch shortly to sort out your account.
        </Banner>
      );
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled billing banner: ${JSON.stringify(unhandled)}`);
    }
  }
}
