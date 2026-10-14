import { z } from "zod";
import { SUPPORT_CATEGORIES, SUPPORT_ATTACHMENT_LIMIT, type SupportCategory } from "./support";

const optionalDetail = (max: number) => z.string().trim().max(max, `Keep this detail to ${max.toLocaleString("en-US")} characters or fewer.`).optional();
export const supportDetailsSchema = z.strictObject({
  pageUrl: optionalDetail(2048), stepsToReproduce: optionalDetail(2000), expectedBehavior: optionalDetail(2000),
  actualBehavior: optionalDetail(2000), browserDevice: optionalDetail(200), invoiceReference: optionalDetail(200),
  requestedChange: optionalDetail(2000), accountEmail: optionalDetail(254),
}).superRefine((details, context) => {
  if (new TextEncoder().encode(JSON.stringify(details)).byteLength > 8000) context.addIssue({ code: "custom", message: "Keep the optional details shorter." });
});
const CATEGORY_DETAILS: Readonly<Record<SupportCategory, readonly string[]>> = {
  bug: ["stepsToReproduce", "expectedBehavior", "actualBehavior", "pageUrl"], support: [], feature: [],
  billing: ["invoiceReference"], website_change: ["pageUrl", "requestedChange"], account_access: ["accountEmail"], general: [], other: [],
};
// Every message below can reach a customer, so none of them is left to zod's defaults ("Invalid input: expected ...").
const attachmentIds = z.array(z.uuid("One of the screenshots could not be used. Remove it and try again.")).max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`).refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once.").default([]);
const SUBMISSION_KEY_MESSAGE = "Your request could not be sent. Refresh the page and try again.";
const submissionKey = z.string(SUBMISSION_KEY_MESSAGE).trim().min(8, SUBMISSION_KEY_MESSAGE).max(128, SUBMISSION_KEY_MESSAGE).regex(/^[A-Za-z0-9_-]+$/, SUBMISSION_KEY_MESSAGE);

export const supportTicketSchema = z.strictObject({
  category: z.enum(SUPPORT_CATEGORIES, "Choose a category."),
  subject: z.string("Write a subject.").trim().min(3, "Write a subject of at least 3 characters.").max(120, "Keep the subject to 120 characters or fewer."),
  description: z.string("Tell us a little more.").trim().min(10, "Tell us a little more (at least 10 characters).").max(5000, "Keep the description to 5,000 characters or fewer."),
  details: supportDetailsSchema.optional(),
  businessId: z.uuid("This account could not be matched to a business.").nullable().optional(), attachmentIds, submissionKey,
});
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export const supportReplySchema = z.strictObject({ body: z.string("Write a reply.").trim().min(1, "Write a reply.").max(5000, "Keep the reply to 5,000 characters or fewer."), attachmentIds, submissionKey });
export type SupportReplyInput = z.infer<typeof supportReplySchema>;

export type SupportFormResult<T> = { readonly success: true; readonly data: T } | { readonly success: false; readonly message: string; readonly field?: string };

export function parseSupportTicketForm(form: FormData): SupportFormResult<SupportTicketInput> {
  const details: Record<string, string> = {};
  const category = form.get("category");
  const allowed = typeof category === "string" && SUPPORT_CATEGORIES.some((value) => value === category) ? CATEGORY_DETAILS[category as SupportCategory] : [];
  for (const key of [...allowed, "browserDevice"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim() !== "") details[key] = value;
  }
  const result = supportTicketSchema.safeParse({
    category, subject: form.get("subject"), description: form.get("description"),
    submissionKey: form.get("submissionKey"), businessId: form.get("businessId") || undefined,
    attachmentIds: form.getAll("attachmentIds"), details,
  });
  if (result.success) return { success: true, data: result.data };
  const issue = result.error.issues[0];
  return { success: false, message: issue?.message ?? "Check your request and try again.", field: String(issue?.path[0] ?? "") };
}
