import type { ChangeEventView, ChangeView, RequestListItem, RequestNeed, WaitingOnYou } from "@brandbasket/db";
import type { ChangeKind, ChangeState } from "@brandbasket/db/change-states";
import {
  acceptLabel,
  CLOSED_LABEL,
  CUSTOMER_STATUSES,
  customerStatus,
  customerStepIndex,
  hoursLabel,
  INCLUDED_EDIT_MINUTES,
  INCLUDED_EDIT_WORKING_DAYS,
  quoteLine,
  REOPEN_WINDOW_DAYS,
  ticketStatusWord,
  WAITING_FOR_YOU,
  type CustomerStatus,
  type TicketStatusWord,
} from "@brandbasket/shared/lib/change-requests";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { SUPPORT_ATTACHMENT_LIMIT, SUPPORT_ATTACHMENT_MAX_BYTES, type SupportCategory, type SupportStatus } from "@brandbasket/shared/lib/support";
import { addWorkingDays, workingDayOf } from "@brandbasket/shared/lib/working-days";
import { z } from "zod";
import type { StatusOf } from "@/components/status-badge";
import { actionFail, type ActionFailure } from "@/lib/action-result";
import { formatBytes, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { parseForm } from "@/lib/form";
import type { ServiceKey } from "@/ui";

/*
 * The rules of Requests as pure functions, ported from apps/platform: lib/requests/{form,status,rows,needs,links,notices}.ts,
 * lib/support-rollout.ts and the checks in components/panel/support/support-attachments.tsx, with their tests. The change
 * states, the five customer words, the 2 included edits a month, the 14 day reopen window and the quote limits live in
 * packages/shared (lib/change-requests) and are read from there, never copied. Client safe: no server imports.
 */

// ---- Where things live ----

export const REQUESTS_PATH = "/requests";
export const NEW_REQUEST_PATH = "/requests?new=1";

/** One request's page. The id is the ticket's: old emails link `/support/<ticketId>`. */
export function requestPath(ticketId: string): string {
  return `${REQUESTS_PATH}/${ticketId}`;
}

/** The list with one request's sheet open (what the bell and old links open). */
export function openRequestHref(ticketId: string): string {
  return `${REQUESTS_PATH}?open=${ticketId}`;
}

/** Where paying a quote's charge happens (the checkout screens own it). */
export function chargePath(chargeId: string): string {
  return `/checkout/charges/${chargeId}`;
}

const ASK_PARAMS = ["intent", "kind", "page", "from", "about"] as const;

/** `/requests/new?...` becomes the dialog on the list, keeping the parameters it reads. A repeated parameter is dropped. */
export function newRequestHref(searchParams: Readonly<Record<string, string | string[] | undefined>> = {}): string {
  const query = new URLSearchParams({ new: "1" });
  for (const name of ASK_PARAMS) {
    const value = searchParams[name];
    if (typeof value === "string" && value !== "") query.set(name, value);
  }
  return `${REQUESTS_PATH}?${query.toString()}`;
}

/** The first value of a query parameter, or undefined when it is missing or repeated. */
export function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// ---- Roles ----

/** Viewers read; the database refuses their writes, and the screens show them no write action. */
export function canWrite(role: "owner" | "editor" | "viewer"): boolean {
  return role !== "viewer";
}

// ---- Kinds and intents ----

/** What a request can be about, in the words of the list. */
export const KIND_LABELS: Readonly<Record<ChangeKind, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Local SEO + AEO",
  billing: "Billing",
  other: "Something else",
};

/**
 * What a customer is trying to do, which is how the new request dialog asks. A change to a website, social or search
 * service opens a change request (a quote and a state); everything else is a plain conversation with the team.
 */
export const REQUEST_INTENTS = ["website_update", "social_request", "search_request", "question", "send_info", "not_working", "billing"] as const;
export type RequestIntent = (typeof REQUEST_INTENTS)[number];

interface IntentRule {
  readonly label: string;
  /** The support category it files under, so the team's inbox and alerts say something sensible. */
  readonly category: SupportCategory;
  /** The change request it opens, or null for a plain conversation. */
  readonly change: ChangeKind | null;
  /** The service the customer must have to be offered it. */
  readonly service: ServiceKey | null;
}

const INTENT_RULES: Readonly<Record<RequestIntent, IntentRule>> = {
  website_update: { label: "Change my website", category: "website_change", change: "website", service: "website" },
  social_request: { label: "Posts or ads", category: "other", change: "social", service: "social" },
  search_request: { label: "Local SEO + AEO", category: "other", change: "search", service: "search" },
  question: { label: "Ask a question", category: "support", change: null, service: null },
  send_info: { label: "Send you something", category: "general", change: null, service: null },
  not_working: { label: "Something is not working", category: "bug", change: null, service: null },
  billing: { label: "Billing", category: "billing", change: null, service: null },
};

export function intentRule(intent: RequestIntent): IntentRule {
  return INTENT_RULES[intent];
}

export interface IntentOption {
  readonly value: RequestIntent;
  readonly label: string;
}

/** The intents a customer is offered: those about a service only when they have bought it, then the rest. */
export function intentOptions(services: readonly ServiceKey[]): readonly IntentOption[] {
  return REQUEST_INTENTS.filter((intent) => {
    const service = INTENT_RULES[intent].service;
    return service === null || services.includes(service);
  }).map((value) => ({ value, label: INTENT_RULES[value].label }));
}

/** Old `?kind=` links (a post's Change link, the help link) land on the intent that means the same. */
const INTENT_OF_KIND: Readonly<Record<ChangeKind, RequestIntent>> = {
  website: "website_update",
  social: "social_request",
  search: "search_request",
  billing: "billing",
  other: "question",
};

/** The page's limit on the Which page box (the box's maxLength and the schema agree). */
export const PAGE_FIELD_LIMIT = 200;
const BODY_MIN = 10;
const BODY_MAX = 5000;
const REPLY_MAX = 5000;

/** A page name from the address: control characters become spaces, runs of spaces become one, and it is cut at the box's limit. */
export function cleanPage(raw: string): string {
  return raw.replace(/[\p{Cc}\s]+/gu, " ").trim().slice(0, PAGE_FIELD_LIMIT);
}

/** What the dialog starts with when a link came with it (a post's Change link, a link that names a page). */
export interface AskDefaults {
  /** The intent to start on, only when this customer may pick it. */
  readonly intent: RequestIntent | null;
  readonly page: string;
  /** Whether the customer came from the preview, so the dialog says the preview is waiting. */
  readonly fromPreview: boolean;
}

/** Reads the link's query: `intent`, or the older `kind`. Repeated or unknown values are ignored, never shown. */
export function readAskDefaults(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
  options: readonly { readonly value: RequestIntent }[],
): AskDefaults {
  const kind = (Object.keys(INTENT_OF_KIND) as ChangeKind[]).find((key) => key === single(searchParams.kind));
  const asked = single(searchParams.intent) ?? (kind === undefined ? null : INTENT_OF_KIND[kind]);
  const offered = options.find((option) => option.value === asked);
  return {
    intent: offered?.value ?? null,
    page: cleanPage(single(searchParams.page) ?? ""),
    fromPreview: single(searchParams.from) === "preview",
  };
}

/** The India calendar day `YYYY-MM-DD` as a date to format. Noon, so no zone can move it to another day. */
function dayAsDate(day: string): Date {
  return new Date(`${day}T12:00:00+05:30`);
}

/** What the box starts with when a request is opened from a post: `About the post "Year-end check-up" (Tue 1 Dec): `. */
export function aboutLine(title: string, dueOn: string, now: Date = new Date()): string {
  return `About the post "${title}" (${formatDate(dayAsDate(dueOn), now)}): `;
}

// ---- Titles ----

const TITLE_LIMIT = 60;
const MIN_TITLE = 3;
const FALLBACK_TITLE = "Request";
/** Three ASCII dots, so a cut title reads as cut. */
const ELLIPSIS = "...";

/**
 * The short name of a request, taken from what the customer wrote: the first sentence, cut at a word with "..." after it if
 * it is long. The form has no title field, so this is what the list shows.
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

// ---- Forms ----

const SUBMISSION_KEY_MESSAGE = "Your request could not be sent. Refresh the page and try again.";
const BODY_MESSAGE = `Tell us a little more, in at least ${BODY_MIN} characters.`;
const ATTACHMENT_MESSAGE = "One of the screenshots could not be used. Remove it and try again.";

/** A form field sent once is a string and sent many times is a list: the schemas always want a list. */
const asList = (value: unknown): unknown => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const submissionKey = z.string(SUBMISSION_KEY_MESSAGE).trim().regex(/^[A-Za-z0-9_-]{8,128}$/, SUBMISSION_KEY_MESSAGE);
const attachmentIds = z.preprocess(
  asList,
  z
    .array(z.uuid(ATTACHMENT_MESSAGE))
    .max(SUPPORT_ATTACHMENT_LIMIT, `Attach up to ${SUPPORT_ATTACHMENT_LIMIT} screenshots.`)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each screenshot once."),
);

/** What the new request dialog sends, once checked. `intent` is one the customer may pick. */
export interface AskInput {
  readonly intent: RequestIntent;
  readonly page: string | null;
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly submissionKey: string;
}

/**
 * The banner above a form shows the first field message, because some fields (the key, the screenshots) have no box of
 * their own to show theirs under.
 */
export function firstMessage(failure: ActionFailure): ActionFailure {
  const first = Object.values(failure.fieldErrors ?? {})[0];
  return first === undefined ? failure : actionFail(first, failure.fieldErrors);
}

/** Reads the new request dialog. Every message here reaches the customer. */
export function parseAsk(formData: FormData, allowed: readonly RequestIntent[]): { readonly ok: true; readonly data: AskInput } | ActionFailure {
  const schema = z.object({
    intent: z.string("Choose what this is about.").refine((value): value is RequestIntent => (allowed as readonly string[]).includes(value), "Choose what this is about."),
    page: z.string().trim().max(PAGE_FIELD_LIMIT, `Keep the page to ${PAGE_FIELD_LIMIT} characters or fewer.`).optional(),
    body: z.string(BODY_MESSAGE).trim().min(BODY_MIN, BODY_MESSAGE).regex(/[\p{L}\p{N}]/u, BODY_MESSAGE).max(BODY_MAX, "Keep it to 5,000 characters or fewer."),
    attachmentIds,
    submissionKey,
  });
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return firstMessage(parsed);
  const { intent, page, body, attachmentIds: ids, submissionKey: key } = parsed.data;
  const cleaned = intent === "website_update" && page !== undefined ? cleanPage(page) : "";
  return { ok: true, data: { intent: intent as RequestIntent, page: cleaned === "" ? null : cleaned, body, attachmentIds: ids, submissionKey: key } };
}

export interface ReplyInput {
  readonly ticketId: string;
  readonly body: string;
  readonly attachmentIds: readonly string[];
  readonly submissionKey: string;
}

/** Reads a reply: 1 to 5,000 characters, up to 3 screenshots, a key that makes a double send one reply. */
export function parseReply(formData: FormData): { readonly ok: true; readonly data: ReplyInput } | ActionFailure {
  const schema = z.object({
    ticketId: z.uuid("This request could not be found."),
    body: z.string("Write a reply.").trim().min(1, "Write a reply.").max(REPLY_MAX, "Keep the reply to 5,000 characters or fewer."),
    attachmentIds,
    submissionKey,
  });
  const parsed = parseForm(schema, formData);
  return parsed.ok ? parsed : firstMessage(parsed);
}

/** The ids a move names. Only ids: the business comes from the session and the database checks the rest. */
export function parseRequestId(formData: FormData): { readonly ok: true; readonly requestId: string } | ActionFailure {
  const parsed = parseForm(z.object({ requestId: z.uuid("This request could not be found.") }), formData);
  return parsed.ok ? { ok: true, requestId: parsed.data.requestId } : firstMessage(parsed);
}

/** Reads the read receipt's two ids. */
export function parseReadReceipt(ticketId: string, messageId: string): boolean {
  return z.uuid().safeParse(ticketId).success && z.uuid().safeParse(messageId).success;
}

/**
 * New requests are refused while the support rollout is limited to listed accounts (`BRANDBASKET_SUPPORT_MODE=internal`).
 * Unset or `on` lets everyone in; replies are never gated.
 */
export function supportSubmissionsEnabled(mode: string | undefined, accountIds: string | undefined, userId: string | null): boolean {
  if (mode === undefined || mode === "on") return true;
  if (mode !== "internal" || userId === null) return false;
  return (accountIds ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

// ---- Screenshots ----

export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export { SUPPORT_ATTACHMENT_LIMIT as ATTACHMENT_LIMIT };

export const ATTACHMENT_HINT = `PNG, JPEG or WebP, up to ${SUPPORT_ATTACHMENT_LIMIT} files, ${formatBytes(SUPPORT_ATTACHMENT_MAX_BYTES)} each.`;

/** Checks the files before any upload starts. Returns what to tell the customer, or null when they may go ahead. */
export function checkAttachments(alreadyAttached: number, files: readonly { readonly size: number; readonly type: string }[]): string | null {
  const tooMany = alreadyAttached + files.length > SUPPORT_ATTACHMENT_LIMIT;
  const unusable = files.some((file) => file.size > SUPPORT_ATTACHMENT_MAX_BYTES || !(ATTACHMENT_TYPES as readonly string[]).includes(file.type));
  return tooMany || unusable ? `Choose up to ${SUPPORT_ATTACHMENT_LIMIT} PNG, JPEG or WebP screenshots, each at most ${formatBytes(SUPPORT_ATTACHMENT_MAX_BYTES)}.` : null;
}

// ---- Reading a change ----

/** One of the five steps under a request's title. */
export interface StepperRow {
  readonly label: CustomerStatus;
  /** `done` is filled, `now` is where the request is, `todo` has not happened. A finished request is all done. */
  readonly mark: "done" | "now" | "todo";
  /** The date it happened ("Fri 27 Nov"), "Included" for a quote step that never was, or nothing. */
  readonly note: string | null;
}

/**
 * The stepper: Sent, Quoted, In progress, Ready to check, Done, each with the date of the first time the request reached
 * it. A request covered without a quote shows "Included" where the quote would be. Null for a request that ended without
 * the change being made: it has no steps to show, the box under it says what happened.
 */
export function stepperRows(change: Pick<ChangeView, "state" | "coverage">, events: readonly ChangeEventView[], now: Date = new Date()): readonly StepperRow[] | null {
  const current = customerStepIndex(change.state);
  if (current === null) return null;
  return CUSTOMER_STATUSES.map((label, index): StepperRow => {
    if (index > current) return { label, mark: "todo", note: null };
    const first = events.find((event) => customerStepIndex(event.state) === index);
    const skipped = first === undefined && index === 1 && (change.coverage === "included" || change.coverage === "free");
    return {
      label,
      mark: index < current || current === CUSTOMER_STATUSES.length - 1 ? "done" : "now",
      note: first !== undefined ? formatDate(first.at, now) : skipped ? "Included" : null,
    };
  });
}

/**
 * The day, in India, the change should be ready to check, as `YYYY-MM-DD`, or null when no date is promised. A quote that is
 * waiting promises it from today ("Accept today and it is ready by..."); work under way promises it from the day the customer
 * said yes (or, for an included edit, the day it was sent). Weekends are skipped; public holidays are not.
 */
export function readyByDay(change: Pick<ChangeView, "state" | "coverage" | "quote" | "acceptedAt" | "createdAt">, today: string): string | null {
  if (change.state === "quoted") return change.quote === null ? null : addWorkingDays(today, change.quote.workingDays);
  if (change.state !== "in_progress") return null;
  if (change.coverage === "paid") {
    if (change.quote === null || change.acceptedAt === null) return null;
    return addWorkingDays(workingDayOf(change.acceptedAt), change.quote.workingDays);
  }
  return addWorkingDays(workingDayOf(change.createdAt), INCLUDED_EDIT_WORKING_DAYS);
}

/** Whether the customer can still reopen: a finished change, or a quote they said not now to, for 14 days. */
export function canReopen(change: Pick<ChangeView, "state" | "coverage">, events: readonly ChangeEventView[], now: Date): boolean {
  const reopenable = change.state === "approved" || change.state === "shipped" || (change.state === "withdrawn" && change.coverage === "paid");
  if (!reopenable) return false;
  const entered = events.filter((event) => event.state === change.state).map((event) => event.at.getTime());
  if (entered.length === 0) return false;
  return now.getTime() - Math.max(...entered) <= REOPEN_WINDOW_DAYS * 86_400_000;
}

/** The one thing the box under the stepper asks the customer to do, if anything. */
export type NextStepAction =
  | { readonly kind: "accept"; readonly label: string }
  | { readonly kind: "pay"; readonly label: string; readonly chargeId: string }
  | { readonly kind: "approve"; readonly label: string };

export interface RequestNextStep {
  readonly title: string;
  readonly text: string;
  /** The price line of a quote: what it is for, and the total. */
  readonly quote: { readonly line: string; readonly total: string } | null;
  /** The page's primary button. */
  readonly action: NextStepAction | null;
  /** A second button beside it: not now, or reopen. */
  readonly secondary: { readonly kind: "decline" | "reopen"; readonly label: string } | null;
  /** Beside the buttons: the price with GST, stated where the customer says yes. Null for USD, which has no GST wording. */
  readonly note: string | null;
}

const NO_BUTTONS = { action: null, secondary: null, quote: null, note: null } as const;

/** "₹1,500 includes 18% GST". The rate comes from the customer's plan; without it the sentence says GST without a number. */
function priceNote(total: string, currency: MoneyCurrency, taxRateBasisPoints: number | null): string | null {
  if (currency !== "INR") return null;
  return taxRateBasisPoints === null ? `${total} includes GST` : `${total} includes ${formatPercent(taxRateBasisPoints / 100)} GST`;
}

/** What happens next, in the words of the mock. `today` is the day in India as `YYYY-MM-DD`. */
export function nextStep(change: ChangeView, events: readonly ChangeEventView[], today: string, now: Date, taxRateBasisPoints: number | null = null): RequestNextStep {
  const readyBy = readyByDay(change, today);
  const date = readyBy === null ? null : formatDate(dayAsDate(readyBy), now);
  const reopen = canReopen(change, events, now) ? ({ kind: "reopen", label: change.state === "withdrawn" ? "Reopen the quote" : "Reopen this change" } as const) : null;
  switch (change.state) {
    case "requested":
      return { title: "We have your request", text: "We will reply with a price, or tell you we have started. You do not need to do anything.", ...NO_BUTTONS };
    case "quoted": {
      const quote = change.quote;
      if (quote === null) return { title: "We are preparing your quote", text: "We will write to you in a moment.", ...NO_BUTTONS };
      const total = formatMoney(quote.amountCents, quote.currency);
      const line = { line: quoteLine({ what: quote.what, hours: quote.hours, unitCents: quote.unitCents, currency: quote.currency }), total };
      const note = priceNote(total, quote.currency, taxRateBasisPoints);
      if (change.chargeId !== null && change.chargeStatus === "open") {
        return {
          title: "Waiting for your payment",
          text: `Pay ${total} and we start straight away. It is ready to check by ${date ?? "the date we agreed"}.`,
          quote: line,
          action: { kind: "pay", label: `Pay ${total}`, chargeId: change.chargeId },
          secondary: null,
          note,
        };
      }
      return {
        title: "Waiting for you",
        text: `This is more than an included ${INCLUDED_EDIT_MINUTES} minute edit, so it needs your OK first. Accept today and it is ready to check by ${date ?? "the date we agreed"}.`,
        quote: line,
        action: { kind: "accept", label: acceptLabel(quote.amountCents, quote.currency) },
        secondary: { kind: "decline", label: "Not now" },
        note,
      };
    }
    case "in_progress":
      return { title: "We are working on it", text: date === null ? "We will tell you when it is ready to check." : `It will be ready to check by ${date}.`, ...NO_BUTTONS };
    case "revisions":
      return { title: "We are making your changes", text: "We will tell you when it is ready to check again.", ...NO_BUTTONS };
    case "preview":
      return {
        title: "Ready for you",
        text: "Take a look. If it is right, press Looks good. If something needs fixing, write it below.",
        quote: null,
        action: { kind: "approve", label: "Looks good" },
        secondary: null,
        note: null,
      };
    case "approved":
      return { title: "Thank you", text: "We are putting this live now.", quote: null, action: null, secondary: reopen, note: null };
    case "shipped":
      return { title: "Done", text: "This change is live.", quote: null, action: null, secondary: reopen, note: null };
    case "declined":
      return { title: "We could not take this on", text: change.closedReason ?? "Write to us below if you would like to talk about it.", ...NO_BUTTONS };
    case "withdrawn":
      return {
        title: "You chose not to go ahead",
        text: reopen === null ? "Write to us below if you change your mind." : "The quote is still here if you change your mind.",
        quote: null,
        action: null,
        secondary: reopen,
        note: null,
      };
  }
}

/** Whether the team has asked this conversation a question and waits for the answer (and the change, if any, is not over). */
export function teamIsWaiting(ticketStatus: SupportStatus, change: Pick<ChangeView, "state"> | null): boolean {
  return ticketStatus === "waiting_on_you" && (change === null || customerStatus(change.state) !== "Done") && (change === null || customerStatus(change.state) !== CLOSED_LABEL);
}

/** The box for a conversation the team asked a question in, when no change step already has something to say. */
export const ASKED_STEP = { title: "Waiting for you", text: "We have asked you something. Your reply is below." } as const;

/** The details panel's line about included edits. */
export function includedEditLine(coverage: ChangeView["coverage"] | null): string {
  switch (coverage) {
    case "included":
      return "One of your included edits";
    case "free":
      return "No charge";
    case "paid":
      return "Not an included edit";
    default:
      return "We will tell you";
  }
}

/** "Brandbasket team" when someone is on it; the customer cannot read staff names. */
export function lookedAfterLine(assigned: boolean): string {
  return assigned ? "Brandbasket team" : "We will assign someone soon";
}

/** "This month: 1 of 2 included edits used." Null when the plan has no included edits, so the line is left out. */
export function includedHeaderLine(used: number, allowed: number): string | null {
  return allowed === 0 ? null : `This month: ${used} of ${allowed} included edits used.`;
}

/** The words for each way a move can be refused, as the database says them. Anything else is "failed". */
export type MoveRefusal = "changed" | "window" | "failed";

const REFUSALS: Readonly<Record<MoveRefusal, string>> = {
  changed: "This request has changed since you opened it. Have a look at where it is now.",
  window: `The ${REOPEN_WINDOW_DAYS} days to reopen this are over. Write to us below and we will help.`,
  failed: "That did not work. Please try again.",
};

/** `wrong_state` and `not_found` mean the request moved on; `window_closed` the 14 days are over; the rest is a fault. */
export function refusalOf(code: string | null): MoveRefusal {
  if (code === "wrong_state" || code === "not_found") return "changed";
  if (code === "window_closed") return "window";
  return "failed";
}

export function refusalMessage(refusal: MoveRefusal): string {
  return REFUSALS[refusal];
}

/** The sentence under `?charge=` when a payment for a quote comes back, or null for anything unknown. */
const CHARGE_RETURN: Readonly<Record<string, { readonly ok: boolean; readonly text: string }>> = {
  paid: { ok: true, text: "Payment received. We have started on your change." },
  processing: { ok: true, text: "Thanks, we’re confirming your payment with the bank. Your change starts within a minute or two." },
  duplicate: { ok: false, text: "That charge had already been settled, so we’ve kept your payment aside and our team will refund it." },
  review: { ok: false, text: "We received a payment that didn’t match the charge. Our team will be in touch." },
  failed: { ok: false, text: "That payment didn’t go through, and nothing was taken. You can try again." },
  "not-open": { ok: false, text: "That charge has already been paid or cleared, so there’s nothing to pay." },
  stale: { ok: false, text: "Your month renewed before that payment arrived, so it wasn’t applied and we’ve kept your payment aside to refund." },
};

export interface NoticeLine {
  /** False for a problem: it is announced as an alert. */
  readonly ok: boolean;
  readonly text: string;
}

export function paymentNoticeLine(value: string | string[] | undefined): NoticeLine | null {
  return typeof value === "string" && Object.hasOwn(CHARGE_RETURN, value) ? (CHARGE_RETURN[value] ?? null) : null;
}

// ---- The list ----

/** What a conversation with no change details is called in the list, from the category it was filed under. */
const PLAIN_LABELS: Readonly<Record<RequestListItem["category"], string>> = {
  bug: "Not working",
  support: "Question",
  feature: "Question",
  billing: "Billing",
  website_change: "Website",
  account_access: "Account",
  general: "Information",
  other: "Question",
};

/** How a status looks in the list: `waiting` is the customer's turn, `progress` is ours, `done` and `closed` are over. */
export type PillTone = "waiting" | "progress" | "done" | "closed";
export type RequestWord = TicketStatusWord | typeof CLOSED_LABEL;

/** The status key the badge draws, or "closed" for a request that ended without the change (no status word of its own). */
export type RowStatus = StatusOf<"request"> | "closed";

const STATUS_OF_WORD: Readonly<Record<RequestWord, RowStatus>> = {
  Sent: "sent",
  Quoted: "quoted",
  "In progress": "in_progress",
  "Ready to check": "ready_to_check",
  Done: "done",
  [WAITING_FOR_YOU]: "waiting_for_you",
  [CLOSED_LABEL]: "closed",
};

export interface RequestRow {
  readonly ticketId: string;
  readonly title: string;
  readonly word: RequestWord;
  readonly status: RowStatus;
  readonly tone: PillTone;
  /** What it is about, for the Service column and the service filter. */
  readonly kind: ChangeKind;
  /** The service mark to draw, or null for Billing, Something else and plain conversations. */
  readonly service: ServiceKey | null;
  /** "Website", "Question": the Service column's words. */
  readonly kindLabel: string;
  readonly lastActivityAt: Date;
  /** The team replied and it has not been read. */
  readonly unread: boolean;
  /** Still going: not Done and not Closed. */
  readonly open: boolean;
  /** The quote waiting for an answer, for the sheet. */
  readonly quoteTotal: string | null;
}

function toneOf(word: RequestWord): PillTone {
  if (word === "Quoted" || word === "Ready to check" || word === WAITING_FOR_YOU) return "waiting";
  if (word === "Done") return "done";
  if (word === CLOSED_LABEL) return "closed";
  return "progress";
}

function kindOfConversation(category: RequestListItem["category"]): ChangeKind {
  if (category === "billing") return "billing";
  if (category === "website_change") return "website";
  return "other";
}

/** The Requests list's rows, with Waiting for you first and each group in the order given (newest activity first). */
export function requestRows(items: readonly RequestListItem[]): readonly RequestRow[] {
  const rows = items.map((item): RequestRow => {
    const word: RequestWord = teamIsWaiting(item.ticketStatus, item.change)
      ? WAITING_FOR_YOU
      : item.change === null
        ? ticketStatusWord(item.ticketStatus)
        : customerStatus(item.change.state);
    const kind = item.change === null ? kindOfConversation(item.category) : item.change.kind;
    const quote = item.change?.state === "quoted" ? item.change.quote : null;
    return {
      ticketId: item.ticketId,
      title: item.subject,
      word,
      status: STATUS_OF_WORD[word],
      tone: toneOf(word),
      kind,
      service: kind === "website" || kind === "social" || kind === "search" ? kind : null,
      kindLabel: item.change === null ? PLAIN_LABELS[item.category] : KIND_LABELS[item.change.kind],
      lastActivityAt: item.lastActivityAt,
      unread: item.unread,
      open: word !== "Done" && word !== CLOSED_LABEL,
      quoteTotal: quote === null ? null : formatMoney(quote.amountCents, quote.currency),
    };
  });
  // Array.prototype.sort is stable: inside each group the newest activity stays first.
  return [...rows].sort((left, right) => Number(right.tone === "waiting" && right.open) - Number(left.tone === "waiting" && left.open));
}

export const STATUS_FILTERS = ["all", "waiting", "open", "done"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function readStatusFilter(value: string | string[] | undefined): StatusFilter {
  return STATUS_FILTERS.find((candidate) => candidate === value) ?? "all";
}

export const SERVICE_FILTERS = ["all", "website", "social", "search", "billing", "other"] as const;
export type ServiceFilter = (typeof SERVICE_FILTERS)[number];

export function readServiceFilter(value: string | string[] | undefined): ServiceFilter {
  return SERVICE_FILTERS.find((candidate) => candidate === value) ?? "all";
}

function inStatus(row: RequestRow, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "waiting") return row.open && row.tone === "waiting";
  if (filter === "open") return row.open && row.tone !== "waiting";
  return !row.open;
}

/** The rows the filters leave; a closed request is filed with Done. */
export function filterRows(rows: readonly RequestRow[], status: StatusFilter, service: ServiceFilter): readonly RequestRow[] {
  return rows.filter((row) => inStatus(row, status) && (service === "all" || row.kind === service));
}

/** The counts beside the status chips, over the rows the service filter leaves. */
export function statusCounts(rows: readonly RequestRow[], service: ServiceFilter): Readonly<Record<StatusFilter, number>> {
  const counted = (status: StatusFilter): number => filterRows(rows, status, service).length;
  return { all: counted("all"), waiting: counted("waiting"), open: counted("open"), done: counted("done") };
}

/** The kinds the list holds, in the filter's order, for the service chips: a kind with no request has no chip. */
export function kindsPresent(rows: readonly RequestRow[]): readonly ChangeKind[] {
  return SERVICE_FILTERS.filter((kind): kind is ChangeKind => kind !== "all" && rows.some((row) => row.kind === kind));
}

// ---- What waits on the customer (Home's Needs you) ----

/** One line of Home's "Needs you": what to do, which service it belongs to (none for Billing or Something else), and where it opens. */
export interface NeedsYouRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly service: ServiceKey | null;
  readonly href: string;
}

const SERVICE_OF_KIND: Readonly<Record<RequestNeed["kind"], ServiceKey | null>> = { website: "website", social: "social", search: "search", billing: null, other: null };

/** The requests that wait on the customer: accept a quote, pay for one, check a change. */
export function needsYouFrom(needs: readonly RequestNeed[]): readonly NeedsYouRow[] {
  return needs.map((need): NeedsYouRow => {
    const price = need.quote === null ? null : `${hoursLabel(need.quote.hours)}, ${formatMoney(need.quote.amountCents, need.quote.currency)}`;
    const base = { key: `request-${need.ticketId}`, service: SERVICE_OF_KIND[need.kind], href: requestPath(need.ticketId) };
    if (need.state === "preview") return { ...base, label: `Check this change: ${need.subject}`, hint: "Ready to check" };
    if (need.acceptedAt !== null) return { ...base, label: `Pay for: ${need.subject}`, hint: price ?? "Waiting for your payment" };
    return { ...base, label: `Accept a quote: ${need.subject}`, hint: price ?? "Waiting for your OK" };
  });
}

/** The conversations the team is waiting on. A conversation already listed as a quote or a check is left out. */
export function waitingOnYouFrom(waiting: readonly WaitingOnYou[], needs: readonly RequestNeed[]): readonly NeedsYouRow[] {
  const listed = new Set(needs.map((need) => need.ticketId));
  return waiting
    .filter((item) => !listed.has(item.ticketId))
    .map((item): NeedsYouRow => ({ key: `request-${item.ticketId}`, label: `Reply to: ${item.subject}`, hint: "Waiting for you", service: null, href: requestPath(item.ticketId) }));
}

/** The states a change can be in, for tests and callers that build views. */
export type { ChangeState };
