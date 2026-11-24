import type { Lead, LeadStatus } from "@brandbasket/db";
import { LEAD_SOURCE_LABELS, websitePlanLabels } from "@brandbasket/shared/lib/lead-source";
import { canStaffChangeLeadStatus } from "@brandbasket/shared/lib/lead-status";
import { bucketOf, enquiryHref, type EnquiryBucket, type EnquiryQuery } from "./enquiries";
import { clockText, type RowChip } from "./requests-model";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The enquiry clock is red past one hour while nobody has been in touch (console redesign notes, rule 4). */
export const ENQUIRY_LATE_AFTER_MS = HOUR_MS;
/** A sign-up that has not paid is flagged after two days (plan S13). */
export const SIGNED_UP_NOT_PAID_AFTER_MS = 2 * DAY_MS;

/** One line of the Enquiries list. Plain data: it crosses from the server page to the client list. */
export interface EnquiryRow {
  readonly id: string;
  readonly businessName: string;
  readonly contactLine: string;
  readonly email: string;
  readonly sourceLabel: string;
  readonly plans: readonly string[];
  readonly status: LeadStatus;
  readonly bucket: Exclude<EnquiryBucket, "all">;
  /** Set once the customer has a business: the primary action is then View client, not Send setup link. */
  readonly businessId: string | null;
  readonly waiting: { readonly text: string; readonly late: boolean };
  readonly chips: readonly RowChip[];
  readonly canMarkContacted: boolean;
  readonly canMarkLost: boolean;
}

export function toEnquiryRow(lead: Lead, now: Date): EnquiryRow {
  const elapsed = Math.max(0, now.getTime() - lead.createdAt.getTime());
  const bucket = bucketOf(lead.status);
  const signedUpNotPaid = lead.source === "signup" && lead.status === "account_created";
  const late = bucket === "to_contact" && elapsed > ENQUIRY_LATE_AFTER_MS;
  const chips: RowChip[] = [];
  if (late) chips.push({ label: "Late", variant: "failed" });
  if (signedUpNotPaid && elapsed >= SIGNED_UP_NOT_PAID_AFTER_MS) chips.push({ label: "Not paid", variant: "failed" });
  return {
    id: lead.id,
    businessName: lead.businessName,
    contactLine: lead.city === null ? lead.name : `${lead.name} · ${lead.city}`,
    email: lead.email,
    sourceLabel: signedUpNotPaid ? "Sign-up, not paid" : LEAD_SOURCE_LABELS[lead.source],
    plans: websitePlanLabels(lead.plans),
    status: lead.status,
    bucket,
    businessId: lead.businessId,
    waiting: { text: clockText(elapsed), late },
    chips,
    canMarkContacted: lead.status === "new",
    canMarkLost: canStaffChangeLeadStatus(lead.status) && lead.status !== "lost",
  };
}

/** The list address, with the open enquiry when there is one. The owner filter is never carried: nobody owns an enquiry. */
export function enquiryListHref(query: EnquiryQuery, open: string | null = null): string {
  const href = enquiryHref({ ...query, owner: "anyone" });
  return open === null ? href : `${href}&open=${encodeURIComponent(open)}`;
}
