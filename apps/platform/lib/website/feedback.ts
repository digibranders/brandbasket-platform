import { SUPPORT_ATTACHMENT_LIMIT } from "@brandbasket/shared/lib/support";
import { z } from "zod";
import { titleFromText } from "@/lib/requests/form";

export interface PreviewFeedbackInput {
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly submissionKey: string;
}

export type PreviewFeedbackParse =
  | { readonly success: true; readonly data: PreviewFeedbackInput }
  | { readonly success: false; readonly field: string; readonly message: string };

const SUBMISSION_KEY_MESSAGE = "Your changes could not be sent. Refresh the page and try again.";
const BODY_MESSAGE = "Tell us what to change, in at least 10 characters.";

/** Reads the feedback form under a preview. Every message here reaches the customer. */
export function parsePreviewFeedback(form: FormData): PreviewFeedbackParse {
  const schema = z.strictObject({
    body: z.string(BODY_MESSAGE).trim().min(10, BODY_MESSAGE).regex(/[\p{L}\p{N}]/u, BODY_MESSAGE).max(5000, "Keep it to 5,000 characters or fewer."),
    attachmentIds: z
      .array(z.uuid("One of the screenshots could not be used. Remove it and try again."))
      .max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once."),
    submissionKey: z.string(SUBMISSION_KEY_MESSAGE).trim().regex(/^[A-Za-z0-9_-]{8,128}$/, SUBMISSION_KEY_MESSAGE),
  });
  const parsed = schema.safeParse({ body: form.get("body"), attachmentIds: form.getAll("attachmentIds"), submissionKey: form.get("submissionKey") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? ""), message: issue?.message ?? "Check what you wrote and try again." };
  }
  return { success: true, data: parsed.data };
}

/** The ticket's subject: marks it as feedback on the preview and its round, then the first sentence of what the customer wrote. */
export function feedbackSubject(body: string, round: number): string {
  return `Preview feedback, round ${round}: ${titleFromText(body)}`;
}
