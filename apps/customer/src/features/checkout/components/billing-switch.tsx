"use client";

import type { BillingInterval } from "@brandbasket/db";
import { useRouter } from "next/navigation";
import { Badge, Segmented } from "@/ui";

/*
 * Monthly | Yearly above the checkout's lines (docs/design/annual-billing-options.html in the BrandBasket workspace, option A).
 * The choice lives in the address (`?billing=yearly`), so the server prices the lines, the code and the Pay button for it and a
 * reload keeps it.
 */

interface BillingSwitchProps {
  readonly interval: BillingInterval;
  readonly monthlyHref: string;
  readonly yearlyHref: string;
}

export function BillingSwitch({ interval, monthlyHref, yearlyHref }: BillingSwitchProps) {
  const router = useRouter();
  return (
    <Segmented
      aria-label="How often you pay"
      value={interval}
      onValueChange={(next) => router.replace(next === "year" ? yearlyHref : monthlyHref, { scroll: false })}
      options={[
        { value: "month", label: "Monthly" },
        {
          value: "year",
          label: (
            <span className="inline-flex items-center gap-2">
              Yearly <Badge tone="pos">Save 10%</Badge>
            </span>
          ),
        },
      ]}
    />
  );
}
