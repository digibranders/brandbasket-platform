import type { LeadStatus } from "./schema";

/** Enquiries waiting for someone to get in touch: new ones, and accounts opened that have not paid. No runtime imports, so client components can read it. */
export const LEAD_STATUSES_TO_CONTACT = ["new", "account_created"] as const satisfies readonly LeadStatus[];

/**
 * Statuses only the system sets: creating the customer's account sets `account_created`, and a confirmed first
 * payment sets `paid`. Staff can neither choose them nor move a lead out of them.
 */
export const SYSTEM_LEAD_STATUSES = ["account_created", "paid"] as const satisfies readonly LeadStatus[];
export type SystemLeadStatus = (typeof SYSTEM_LEAD_STATUSES)[number];
/** The statuses staff may put a lead in by hand. */
export type StaffLeadStatus = Exclude<LeadStatus, SystemLeadStatus>;

export function isSystemLeadStatus(status: LeadStatus): status is SystemLeadStatus {
  return (SYSTEM_LEAD_STATUSES as readonly LeadStatus[]).includes(status);
}
