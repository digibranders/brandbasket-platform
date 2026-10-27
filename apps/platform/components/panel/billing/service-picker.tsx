import type { ReactElement } from "react";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { REACTIVATE_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { PackageCard } from "@/components/panel/membership/package-card";
import { MEMBERSHIP_SERVICES_PARAM } from "@/lib/membership";

interface ServicePickerProps {
  /** The services ticked: their previous ones until the customer changes them. Never empty. */
  readonly selected: readonly MonthlyAddOnId[];
  readonly currency: MoneyCurrency;
}

/**
 * The services a customer who cancelled the plan chooses again on Billing. The checkout's own service rows, ticked from the
 * address like the checkout's (`?services=`), every one at its own price: the package offer ended with the cancel, so no line
 * has a discount.
 */
export function ServicePicker({ selected, currency }: ServicePickerProps): ReactElement {
  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 id="reactivate-services-heading" className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
        Choose your services
      </h3>
      <p className="mt-1 text-sm text-ink-2">Every service is at its own price when you come back.</p>
      <div className="mt-4 max-w-xl">
        <PackageCard
          selected={selected}
          lines={bundleLines(selected, currency, true)}
          hrefFor={(selection) => `${REACTIVATE_HREF}?${MEMBERSHIP_SERVICES_PARAM}=${selection.join(",")}`}
          currency={currency}
        />
      </div>
    </div>
  );
}
