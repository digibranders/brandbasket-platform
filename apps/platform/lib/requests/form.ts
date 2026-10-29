import type { ChangeKind } from "@brandbasket/db/change-states";
import { SUPPORT_ATTACHMENT_LIMIT, type SupportCategory } from "@brandbasket/shared/lib/support";
import { z } from "zod";
import type { ServiceKey } from "@/lib/first-look";
import { dueLabel } from "@/lib/social/week";

/** What a request can be about, in the words of the form. */
export const KIND_LABELS: Readonly<Record<ChangeKind, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Local SEO + AEO",
  billing: "Billing",
  other: "Something else",
};

const KIND_ORDER: readonly ChangeKind[] = ["website", "social", "search", "billing", "other"];
const SERVICE_KINDS: readonly ChangeKind[] = ["website", "social", "search"];

/** The kinds a customer can pick: the services they have bought, then Billing and Something else. */
export function kindOptions(services: readonly ServiceKey[]): readonly { readonly value: ChangeKind; readonly label: string }[] {
  return KIND_ORDER.filter((kind) => !SERVICE_KINDS.includes(kind) || services.includes(kind as ServiceKey)).map((value) => ({ value, label: KIND_LABELS[value] }));
}

/**
 * What a customer is trying to do, which is how the new request form asks. A change to a website or a question about a
 * service opens a change request (a quote and a state); everything else is a plain conversation with the team.
 */
export const REQUEST_INTENTS = ["website_update", "social_request", "search_request", "question", "send_info", "not_working", "billing"] as const;
export type RequestIntent = (typeof REQUEST_INTENTS)[number];

interface IntentRule {
  readonly label: string;
  readonly hint: string;
  /** The support category it files under, so the team's inbox and alerts say something sensible. */
  readonly category: SupportCategory;
  /** The change request it opens, or null for a plain conversation. */
  readonly change: ChangeKind | null;
  /** The service the customer must have to be offered it. */
  readonly service: ServiceKey | null;
  readonly bodyLabel: string;
  readonly placeholder: string;
}

const INTENT_RULES: Readonly<Record<RequestIntent, IntentRule>> = {
  website_update: {
    label: "Change my website",
    hint: "Text, photos, prices or a new page.",
    category: "website_change",
    change: "website",
    service: "website",
    bodyLabel: "What do you want changed?",
    placeholder: "Tell us what to change. A screenshot helps.",
  },
  social_request: {
    label: "Ask about my social media or ads",
    hint: "A post, a page or your ads.",
    category: "other",
    change: "social",
    service: "social",
    bodyLabel: "What do you need?",
    placeholder: "Tell us what you need.",
  },
  search_request: {
    label: "Ask about Local SEO + AEO",
    hint: "Your Google listing, reviews or search results.",
    category: "other",
    change: "search",
    service: "search",
    bodyLabel: "What do you need?",
    placeholder: "Tell us what you need.",
  },
  question: {
    label: "Ask a question",
    hint: "We reply here.",
    category: "support",
    change: null,
    service: null,
    bodyLabel: "What would you like to know?",
    placeholder: "Ask your question.",
  },
  send_info: {
    label: "Send us information",
    hint: "Details, files or photos for your work.",
    category: "general",
    change: null,
    service: null,
    bodyLabel: "What are you sending?",
    placeholder: "Tell us what this is for. Attach photos below.",
  },
  not_working: {
    label: "Something is not working",
    hint: "A page, a form or a link that is broken.",
    category: "bug",
    change: null,
    service: null,
    bodyLabel: "What is not working?",
    placeholder: "Tell us what you see and where. A screenshot helps.",
  },
  billing: {
    label: "Billing or my plan",
    hint: "A payment, an invoice or your services.",
    category: "billing",
    change: null,
    service: null,
    bodyLabel: "What do you need to know?",
    placeholder: "Tell us what you need.",
  },
};

export function intentRule(intent: RequestIntent): IntentRule {
  return INTENT_RULES[intent];
}

export interface IntentOption {
  readonly value: RequestIntent;
  readonly label: string;
  readonly hint: string;
}

/** The intents a customer is offered: those about a service only when they have bought it, then the rest. */
export function intentOptions(services: readonly ServiceKey[]): readonly IntentOption[] {
  return REQUEST_INTENTS.filter((intent) => {
    const service = INTENT_RULES[intent].service;
    return service === null || services.includes(service);
  }).map((value) => ({ value, label: INTENT_RULES[value].label, hint: INTENT_RULES[value].hint }));
}

/** Old `?kind=` links (the Pages tab, a post's Change link, the help link) land on the intent that means the same. */
const INTENT_OF_KIND: Readonly<Record<ChangeKind, RequestIntent>> = {
  website: "website_update",
  social: "social_request",
  search: "search_request",
  billing: "billing",
  other: "question",
};

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

/** What the new request page starts with when a link came with it (the Pages tab, a post's Change link, the preview's Ask for changes). */
export interface AskDefaults {
  /** The intent to start on, only when this customer may pick it. */
  readonly intent: RequestIntent | null;
  readonly page: string;
  /** Whether the customer came from the preview, so the page says the preview is waiting. */
  readonly fromPreview: boolean;
}

/** Reads the link's query: `intent`, or the older `kind`. Repeated or unknown values are ignored, never shown. */
export function readAskDefaults(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
  options: readonly { readonly value: RequestIntent }[],
): AskDefaults {
  const single = (name: string): string | null => {
    const value = searchParams[name];
    return typeof value === "string" ? value : null;
  };
  const kind = (Object.keys(INTENT_OF_KIND) as ChangeKind[]).find((key) => key === single("kind"));
  const asked = single("intent") ?? (kind === undefined ? null : INTENT_OF_KIND[kind]);
  const offered = options.find((option) => option.value === asked);
  return {
    intent: offered?.value ?? null,
    page: (single("page") ?? "").trim().slice(0, PAGE_FIELD_LIMIT),
    fromPreview: single("from") === "preview",
  };
}

/** What the form sends, once checked. `intent` is one the customer may pick. */
export interface AskForChangeInput {
  readonly intent: RequestIntent;
  readonly page: string | null;
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly submissionKey: string;
}

export type AskParse =
  | { readonly success: true; readonly data: AskForChangeInput }
  | { readonly success: false; readonly field: string; readonly message: string };

const SUBMISSION_KEY_MESSAGE = "Your request could not be sent. Refresh the page and try again.";
const BODY_MESSAGE = "Tell us a little more, in at least 10 characters.";

/** Reads the new request form. Every message here reaches the customer. */
export function parseAskForm(form: FormData, allowed: readonly RequestIntent[]): AskParse {
  const schema = z.strictObject({
    intent: z.string("Choose what this is about.").refine((value): value is RequestIntent => (allowed as readonly string[]).includes(value), "Choose what this is about."),
    page: z.string().trim().max(200, "Keep the page to 200 characters or fewer.").optional(),
    body: z.string(BODY_MESSAGE).trim().min(10, BODY_MESSAGE).regex(/[\p{L}\p{N}]/u, BODY_MESSAGE).max(5000, "Keep it to 5,000 characters or fewer."),
    attachmentIds: z
      .array(z.uuid("One of the screenshots could not be used. Remove it and try again."))
      .max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once."),
    submissionKey: z.string(SUBMISSION_KEY_MESSAGE).trim().regex(/^[A-Za-z0-9_-]{8,128}$/, SUBMISSION_KEY_MESSAGE),
  });
  const parsed = schema.safeParse({
    intent: form.get("intent"),
    page: form.get("page") ?? undefined,
    body: form.get("body"),
    attachmentIds: form.getAll("attachmentIds"),
    submissionKey: form.get("submissionKey"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? ""), message: issue?.message ?? "Check what you wrote and try again." };
  }
  const { intent, page, body, attachmentIds, submissionKey } = parsed.data;
  return { success: true, data: { intent: intent as RequestIntent, page: intent === "website_update" && page !== undefined && page !== "" ? page : null, body, attachmentIds, submissionKey } };
}
