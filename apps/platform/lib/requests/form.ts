import type { ChangeKind } from "@brandbasket/db/change-states";
import { SUPPORT_ATTACHMENT_LIMIT, type SupportCategory } from "@brandbasket/shared/lib/support";
import { z } from "zod";
import type { ServiceKey } from "@/lib/first-look";
import { dueLabel } from "@/lib/social/week";

/** What a request can be about, in the words of the form. */
export const KIND_LABELS: Readonly<Record<ChangeKind, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Search",
  billing: "Billing",
  other: "Something else",
};

/** The support category each kind files under, so the team's existing inbox and alerts say something sensible. */
export const KIND_CATEGORY: Readonly<Record<ChangeKind, SupportCategory>> = {
  website: "website_change",
  billing: "billing",
  social: "other",
  search: "other",
  other: "other",
};

const KIND_ORDER: readonly ChangeKind[] = ["website", "social", "search", "billing", "other"];
const SERVICE_KINDS: readonly ChangeKind[] = ["website", "social", "search"];

/** The kinds a customer can pick: the services they have bought, then Billing and Something else. */
export function kindOptions(services: readonly ServiceKey[]): readonly { readonly value: ChangeKind; readonly label: string }[] {
  return KIND_ORDER.filter((kind) => !SERVICE_KINDS.includes(kind) || services.includes(kind as ServiceKey)).map((value) => ({ value, label: KIND_LABELS[value] }));
}

/** The kind to start on: the one asked for in the address when this customer is offered it, else the first choice. */
export function pickKind(requested: string | undefined, options: readonly { readonly value: ChangeKind }[]): ChangeKind | undefined {
  return options.find((option) => option.value === requested)?.value ?? options[0]?.value;
}

/** What the box starts with when Ask for a change is opened from a post: `About the post "Year-end check-up" (Tue 1 Dec): `. */
export function aboutLine(title: string, dueOn: string): string {
  return `About the post "${title}" (${dueLabel(dueOn)}): `;
}

const TITLE_LIMIT = 60;
const MIN_TITLE = 3;
const FALLBACK_TITLE = "Request";
/** Three ASCII dots, so a cut title reads as cut. */
const ELLIPSIS = "...";

/**
 * The short name of a request, taken from what the customer wrote: the first sentence, cut at a word with "..." after it if it is long. The form
 * has no title field, so this is what the list shows.
 */
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

/** The page's limit on the Which page box (the form's maxLength and parseAskForm agree). */
const PAGE_FIELD_LIMIT = 200;

/** What the Ask for a change page starts with when a link came with it (the Pages tab, the preview's Ask for changes). */
export interface AskDefaults {
  /** The kind to start on, only when this customer may pick it. */
  readonly kind: ChangeKind | null;
  readonly page: string;
  /** Whether the customer came from the preview, so the page says the preview is waiting. */
  readonly fromPreview: boolean;
}

/** Reads the link's query. Repeated or unknown values are ignored, never shown. */
export function readAskDefaults(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
  options: readonly { readonly value: ChangeKind }[],
): AskDefaults {
  const single = (name: string): string | null => {
    const value = searchParams[name];
    return typeof value === "string" ? value : null;
  };
  const offered = options.find((option) => option.value === single("kind"));
  return {
    kind: offered?.value ?? null,
    page: (single("page") ?? "").trim().slice(0, PAGE_FIELD_LIMIT),
    fromPreview: single("from") === "preview",
  };
}

/** What the form sends, once checked. `kind` is one the customer may pick. */
export interface AskForChangeInput {
  readonly kind: ChangeKind;
  readonly page: string | null;
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly submissionKey: string;
}

export type AskParse =
  | { readonly success: true; readonly data: AskForChangeInput }
  | { readonly success: false; readonly field: string; readonly message: string };

const SUBMISSION_KEY_MESSAGE = "Your request could not be sent. Refresh the page and try again.";

/** Reads the Ask for a change form. Every message here reaches the customer. */
export function parseAskForm(form: FormData, allowedKinds: readonly ChangeKind[]): AskParse {
  const schema = z.strictObject({
    kind: z.string("Choose what this is about.").refine((value): value is ChangeKind => (allowedKinds as readonly string[]).includes(value), "Choose what this is about."),
    page: z.string().trim().max(200, "Keep the page to 200 characters or fewer.").optional(),
    body: z.string("Say what you want changed.").trim().min(10, "Say what you want changed, in at least 10 characters.").regex(/[\p{L}\p{N}]/u, "Say what you want changed, in at least 10 characters.").max(5000, "Keep it to 5,000 characters or fewer."),
    attachmentIds: z
      .array(z.uuid("One of the screenshots could not be used. Remove it and try again."))
      .max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once."),
    submissionKey: z.string(SUBMISSION_KEY_MESSAGE).trim().regex(/^[A-Za-z0-9_-]{8,128}$/, SUBMISSION_KEY_MESSAGE),
  });
  const parsed = schema.safeParse({
    kind: form.get("kind"),
    page: form.get("page") ?? undefined,
    body: form.get("body"),
    attachmentIds: form.getAll("attachmentIds"),
    submissionKey: form.get("submissionKey"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? ""), message: issue?.message ?? "Check what you wrote and try again." };
  }
  const { kind, page, body, attachmentIds, submissionKey } = parsed.data;
  return { success: true, data: { kind: kind as ChangeKind, page: kind === "website" && page !== undefined && page !== "" ? page : null, body, attachmentIds, submissionKey } };
}
