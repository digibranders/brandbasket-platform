import Link from "next/link";
import type { ReactElement } from "react";

/**
 * One line above a pay button for a business billed in rupees that has given no billing details yet. The link goes
 * to the form on Billing, which every account that reaches a page with this prompt can open.
 */
export function BillingDetailsPrompt(): ReactElement {
  return (
    <p className="text-sm leading-relaxed text-ink-soft">
      Need a GST invoice in your company’s name?{" "}
      <Link href="/billing#billing-details" className="link-underline text-ink">
        Add your billing details
      </Link>{" "}
      before you pay.
    </p>
  );
}
