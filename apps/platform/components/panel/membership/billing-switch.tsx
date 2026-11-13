"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { BillingInterval } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";

/*
 * Monthly | Yearly above the checkout's lines. The choice lives in the address (`?billing=yearly`), so the server prices the
 * lines, the code and the Pay button for it and a reload keeps it.
 */

interface BillingSwitchProps {
  readonly interval: BillingInterval;
  readonly monthlyHref: string;
  readonly yearlyHref: string;
}

const OPTION = "rounded-[0.5rem] px-4 py-2 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none";

export function BillingSwitch({ interval, monthlyHref, yearlyHref }: BillingSwitchProps): ReactElement {
  const router = useRouter();
  const choose = (next: BillingInterval): void => {
    if (next !== interval) router.replace(next === "year" ? yearlyHref : monthlyHref, { scroll: false });
  };
  return (
    <div role="radiogroup" aria-label="How often you pay" className="mb-4 inline-flex gap-1 rounded-[0.625rem] bg-sunken p-1">
      <button type="button" role="radio" aria-checked={interval === "month"} onClick={() => choose("month")} className={cn(OPTION, interval === "month" ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
        Monthly
      </button>
      <button type="button" role="radio" aria-checked={interval === "year"} onClick={() => choose("year")} className={cn(OPTION, "inline-flex items-center gap-2", interval === "year" ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
        Yearly
        <span className="rounded-md bg-sage-wash px-2 py-px text-[0.71875rem] font-semibold text-sage-deep">Save 10%</span>
      </button>
    </div>
  );
}
