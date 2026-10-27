import type { StaffRole } from "@brandbasket/db";

/** Lowest access first, as the role picker lists them. Kept free of runtime imports so client forms can use it. */
export const ROLE_ORDER: readonly StaffRole[] = ["support", "finance", "admin"];

export const ROLE_LABELS: Readonly<Record<StaffRole, string>> = { support: "Support", finance: "Finance", admin: "Admin" };

/** What each role can do, in the Staff table's Can column (mock screen 9). */
export const ROLE_CAN: Readonly<Record<StaffRole, string>> = {
  support: "Clients, enquiries, projects, requests",
  finance: "Plus payments, invoices, prices",
  admin: "Everything",
};
