import { SUPPORT_ATTACHMENT_LIMIT } from "@brandbasket/shared/lib/support";
import { z } from "zod";

/*
 * Ported from apps/platform lib/website/feedback.ts, lib/requests/form.ts (titleFromText) and lib/support-rollout.ts. Every
 * message here reaches the customer verbatim.
 */

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

const feedbackSchema = z.strictObject({
  body: z.string(BODY_MESSAGE).trim().min(10, BODY_MESSAGE).regex(/[\p{L}\p{N}]/u, BODY_MESSAGE).max(5000, "Keep it to 5,000 characters or fewer."),
  attachmentIds: z
    .array(z.uuid("One of the screenshots could not be used. Remove it and try again."))
    .max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once."),
  submissionKey: z.string(SUBMISSION_KEY_MESSAGE).trim().regex(/^[A-Za-z0-9_-]{8,128}$/, SUBMISSION_KEY_MESSAGE),
});

/** Reads the feedback form under a preview. `attachmentIds` may be sent any number of times, so it is read as a list. */
export function parsePreviewFeedback(form: FormData): PreviewFeedbackParse {
  const parsed = feedbackSchema.safeParse({ body: form.get("body"), attachmentIds: form.getAll("attachmentIds"), submissionKey: form.get("submissionKey") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? ""), message: issue?.message ?? "Check what you wrote and try again." };
  }
  return { success: true, data: parsed.data };
}

const TITLE_LIMIT = 60;
const MIN_TITLE = 3;
const FALLBACK_TITLE = "Request";
/** Three ASCII dots, so a cut title reads as cut. */
const ELLIPSIS = "...";

/** The short name of a request from what the customer wrote: the first sentence, cut at a word with "..." if it is long. */
export function titleFromText(text: string): string {
  const whole = text.replace(/\s+/g, " ").trim();
  const firstSentence = whole.split(/(?<=[.!?])\s/)[0] ?? whole;
  // A first sentence of a word or two ("Hi.") says nothing, so the whole text is used instead.
  let title = firstSentence.replace(/[\s.!?]+$/u, "").length >= 8 ? firstSentence : whole;
  let cutShort = false;
  if (title.length > TITLE_LIMIT) {
    // The dots count toward the limit, so the stored title never exceeds it.
    const room = TITLE_LIMIT - ELLIPSIS.length;
    const cut = title.slice(0, room + 1);
    const space = cut.lastIndexOf(" ");
    title = (space > 20 ? cut.slice(0, space) : cut.slice(0, room)).trim();
    cutShort = true;
  }
  title = title.replace(/[\s,;:.!?]+$/u, "");
  if (cutShort) title += ELLIPSIS;
  // The ticket subject must be at least 3 characters, so a title that was all punctuation falls back to the text as written.
  if (title.length < MIN_TITLE) title = whole.slice(0, TITLE_LIMIT).trim() || FALLBACK_TITLE;
  return `${title.slice(0, 1).toUpperCase()}${title.slice(1)}`;
}

/** The ticket's subject: marks it as feedback on the preview and its round, then the first sentence of what the customer wrote. */
export function feedbackSubject(body: string, round: number): string {
  return `Preview feedback, round ${round}: ${titleFromText(body)}`;
}

/** `BRANDBASKET_SUPPORT_MODE`: unset or "on" lets everyone send, "internal" only the listed accounts, anything else no one. */
export function supportSubmissionsEnabled(mode: string | undefined, accountIds: string | undefined, userId: string | null): boolean {
  if (mode === undefined || mode === "on") return true;
  if (mode !== "internal" || userId === null) return false;
  return (accountIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}
