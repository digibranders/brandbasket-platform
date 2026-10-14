import { z } from "zod";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, type SupportCategory } from "@firstfold/shared/lib/support";

export interface StaffSupportActionState {
  readonly kind: "idle" | "saved" | "invalid" | "conflict" | "error";
  readonly message?: string;
  readonly field?: string;
  readonly reference?: string;
  readonly submissionKey?: string;
}
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
