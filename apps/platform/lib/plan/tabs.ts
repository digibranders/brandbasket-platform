import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import type { SectionTab } from "@/lib/section-tabs";

export const BILLING_PATH = "/billing";

/** Plan & billing is one place in the sidebar and two pages: what the customer pays for, and how it is paid. */
export const PLAN_TABS: readonly SectionTab[] = [
  { href: ADD_ONS_PATH, label: "Your services" },
  { href: BILLING_PATH, label: "Billing" },
];
