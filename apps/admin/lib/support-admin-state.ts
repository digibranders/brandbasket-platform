import { z } from "zod";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, type SupportCategory } from "@brandbasket/shared/lib/support";

export interface StaffSupportActionState {
  readonly kind: "idle" | "saved" | "invalid" | "conflict" | "error";
  readonly message?: string;
  readonly field?: string;
  readonly reference?: string;
  readonly submissionKey?: string;
  /** Set when a request was opened for a client: the page goes to it. */
  readonly ticketId?: string;
  readonly openedOutcome?: OpenedRequestOutcome;
}

/** What happened after staff opened a request for a client. */
export const OPENED_REQUEST_OUTCOMES = ["emailed", "no-email", "failed", "replayed"] as const;
export type OpenedRequestOutcome = (typeof OPENED_REQUEST_OUTCOMES)[number];
export const OPENED_REQUEST_MESSAGES: Readonly<Record<OpenedRequestOutcome, string>> = {
  emailed: "Request opened. We emailed the owner a link to it.",
  "no-email": "Request opened. The owner signs in with a mobile number, so tell them yourself.",
  failed: "Request opened, but the email to the owner did not go. Tell them yourself.",
  replayed: "This request was already opened.",
};
export const STAFF_SUPPORT_INITIAL_STATE: StaffSupportActionState = { kind: "idle" };
export const STAFF_SUPPORT_CATEGORY_LABELS: Readonly<Record<SupportCategory, string>> = { bug: "Bug", support: "Support", feature: "Feature", billing: "Billing", website_change: "Website change", account_access: "Account access", general: "General feedback", other: "Other" };
export const staffSupportUpdateSchema = z.strictObject({
  ticketId: z.uuid(), expectedVersion: z.coerce.number().int().min(1),
  status: z.enum(SUPPORT_STATUSES), category: z.enum(SUPPORT_CATEGORIES), priority: z.enum(SUPPORT_PRIORITIES),
  assigneeStaffId: z.string().trim().min(1).max(200).nullable(),
});
export const staffSupportMessageSchema = z.strictObject({
  ticketId: z.uuid(), body: z.string().trim().min(1).max(5000),
  visibility: z.enum(["public", "internal"]), submissionKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
});
export const staffSupportLinkSchema = z.strictObject({ ticketId: z.uuid(), issueId: z.uuid() });
export const staffOpenRequestSchema = z.strictObject({
  businessId: z.uuid(),
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
  submissionKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
});
