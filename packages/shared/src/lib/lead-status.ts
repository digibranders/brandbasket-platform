import { isSystemLeadStatus, type LeadStatus, type StaffLeadStatus } from "@firstfold/db";

/** Pipeline order, used for the filter bar. */
export const LEAD_STATUS_ORDER = [
  "new",
  "call_booked",
  "call_done",
  "agreed",
  "invite_sent",
  "account_created",
  "paid",
  "lost",
] as const satisfies readonly LeadStatus[];

/**
 * The statuses staff may choose in the status picker, in pipeline order. `account_created` and `paid` are left out:
 * only creating the customer's account and a confirmed payment set them.
 */
export const STAFF_LEAD_STATUS_ORDER = LEAD_STATUS_ORDER.filter(
  (status): status is StaffLeadStatus & (typeof LEAD_STATUS_ORDER)[number] => !isSystemLeadStatus(status),
);

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: "New",
  call_booked: "Call booked",
  call_done: "Call done",
  agreed: "Agreed",
  invite_sent: "Setup link sent",
  account_created: "Account created",
  paid: "Paid",
  lost: "Lost",
};

/** A status from a form, if it is one staff may choose; null for anything else, system statuses included. */
export function readStaffLeadStatus(value: FormDataEntryValue | null): StaffLeadStatus | null {
  if (typeof value !== "string") return null;
  return (STAFF_LEAD_STATUS_ORDER as readonly string[]).includes(value) ? (value as StaffLeadStatus) : null;
}

/** Whether the status picker is offered for a lead: not once the system has moved it on. */
export function canStaffChangeLeadStatus(current: LeadStatus): boolean {
  return !isSystemLeadStatus(current);
}
