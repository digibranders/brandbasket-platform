import type { ChatbotStatus, Enquiry, EnquiryKind } from "@brandbasket/db";
import { z } from "zod";
import { formatDate, formatRelative } from "@/lib/format";

/*
 * Enquiries, as pure rules (plan 61, section 4): which rows are people and which are only counted, the words and links on a
 * row, the filters, the figures above the list, the CSV, and the chatbot words ported from apps/platform
 * (lib/chatbots-view.ts, lib/site-contacts.ts). No I/O here.
 */

export const ENQUIRIES_PATH = "/enquiries";
export const EXPORT_PATH = "/enquiries/export";
export const CHAT_TAB_PATH = "/enquiries?tab=chat";

/** The list and the figures cover this many days. */
export const WINDOW_DAYS = 30;
/** A website that has reported no contact in this long is treated as not reporting (ported: 90 days). */
export const MEASURED_DAYS = 90;
const DAY_MS = 86_400_000;

/** The customer's private note on an enquiry, in characters (the database enforces the same). */
export const NOTE_MAX = 1000;

export type RowStatus = "new" | "contacted" | "won" | "lost" | "counted";
export type SourceGroup = "website" | "ads" | "google";

/** The fields of an enquiry the rules read. */
export type EnquiryRecord = Pick<Enquiry, "id" | "kind" | "source" | "name" | "phone" | "email" | "message" | "status" | "note" | "receivedAt" | "sourceRef">;

/** One line of the list, plain data so it can cross to the browser. */
export interface EnquiryRow {
  readonly id: string;
  readonly kind: EnquiryKind;
  /** A tap or a profile call: no identity, nothing to reply to. */
  readonly counted: boolean;
  readonly title: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly source: string;
  readonly sourceGroup: SourceGroup;
  /** What they asked, or for a counted row what we can and cannot see. Empty when nothing was left. */
  readonly message: string;
  readonly receivedAt: Date;
  readonly status: RowStatus;
  readonly note: string | null;
  /** 1, or for a day of Google profile calls how many. */
  readonly count: number;
  /** A chat enquiry whose conversation can be opened. */
  readonly hasConversation: boolean;
}

const COUNTED_TITLES = { call_tap: "Call button tap", whatsapp_tap: "WhatsApp button tap", form: "Contact form sent", google_call: "Calls from your Google profile" } as const;

const COUNTED_MESSAGES = {
  call_tap: "Someone tapped Call on your website. We can see the tap, not who called.",
  whatsapp_tap: "Someone tapped WhatsApp on your website. We can see the tap, not who messaged.",
  form: "Someone sent the contact form on your website. We can see that it was sent, not who sent it.",
} as const;

const SOURCE_LABELS: Readonly<Record<Exclude<EnquiryKind, "ad_lead">, string>> = {
  chat: "Website chat",
  form: "Website form",
  call_tap: "Website tap",
  whatsapp_tap: "Website tap",
  google_call: "Google profile",
};

const GROUPS: Readonly<Record<EnquiryKind, SourceGroup>> = {
  chat: "website",
  form: "website",
  call_tap: "website",
  whatsapp_tap: "website",
  google_call: "google",
  ad_lead: "ads",
};

export const SOURCE_GROUP_LABELS: Readonly<Record<SourceGroup, string>> = { website: "Website", ads: "Ads", google: "Google" };

/** Finishes "18 of 47 came from ...". */
export const SOURCE_PHRASES: Readonly<Record<SourceGroup, string>> = { website: "your website", ads: "your ads", google: "your Google profile" };

const CHAT_REF = "chatbot_lead:";

/** The kinds that come from a person who left something. Used to find who is still waiting for a reply. */
export const PERSON_KINDS = ["chat", "form", "ad_lead"] as const satisfies readonly EnquiryKind[];

/**
 * Whether an enquiry has no identity to reply to: taps and Google profile calls, and a form that arrived without any detail
 * (until form contents are stored, plan 61 gate G2, every form is only counted).
 */
export function isCounted(e: Pick<EnquiryRecord, "kind" | "name" | "phone" | "email" | "message">): boolean {
  if (e.kind === "call_tap" || e.kind === "whatsapp_tap" || e.kind === "google_call") return true;
  return e.kind === "form" && e.name === null && e.phone === null && e.email === null && e.message === null;
}

/** What a person is called: the first of name, email and phone they left, else "Unnamed visitor" (ported, behaviour 10). */
export function enquiryTitle(e: Pick<EnquiryRecord, "name" | "email" | "phone">): string {
  return [e.name, e.email, e.phone].find((value): value is string => value !== null && value.trim() !== "") ?? "Unnamed visitor";
}

/** The chat lead an enquiry came from, from its `source_ref`, or null for any other kind. */
export function chatLeadId(e: Pick<EnquiryRecord, "kind" | "sourceRef">): string | null {
  if (e.kind !== "chat" || !e.sourceRef.startsWith(CHAT_REF)) return null;
  const id = e.sourceRef.slice(CHAT_REF.length);
  return z.uuid().safeParse(id).success ? id : null;
}

function sourceLabel(e: Pick<EnquiryRecord, "kind" | "source">): string {
  if (e.kind === "ad_lead") return e.source?.trim() || "Ad";
  return SOURCE_LABELS[e.kind];
}

/** One enquiry as a list row. */
export function toRow(e: EnquiryRecord): EnquiryRow {
  const counted = isCounted(e);
  const countedKind = e.kind === "call_tap" || e.kind === "whatsapp_tap" || e.kind === "form" ? e.kind : null;
  return {
    id: e.id,
    kind: e.kind,
    counted,
    title: counted ? COUNTED_TITLES[e.kind as keyof typeof COUNTED_TITLES] : enquiryTitle(e),
    phone: counted ? null : e.phone,
    email: counted ? null : e.email,
    source: sourceLabel(e),
    sourceGroup: GROUPS[e.kind],
    message: counted ? (countedKind === null ? "" : COUNTED_MESSAGES[countedKind]) : (e.message ?? ""),
    receivedAt: e.receivedAt,
    status: counted ? "counted" : e.status,
    note: e.note,
    count: 1,
    hasConversation: chatLeadId(e) !== null,
  };
}

const IST_OFFSET_MS = 19_800_000;
const istDay = (date: Date): string => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * The list's rows, newest first. Google does not say who called, so its profile calls are shown as one row per India day with
 * the number of calls, never as one invented person per call (plan 61, section 4).
 */
export function buildRows(records: readonly EnquiryRecord[]): EnquiryRow[] {
  const rows: EnquiryRow[] = [];
  const googleByDay = new Map<string, number>();
  for (const record of records) {
    if (record.kind !== "google_call") {
      rows.push(toRow(record));
      continue;
    }
    const day = istDay(record.receivedAt);
    const existing = googleByDay.get(day);
    if (existing !== undefined) {
      const row = rows[existing];
      if (row !== undefined) rows[existing] = { ...row, count: row.count + 1, message: googleMessage(row.count + 1) };
      continue;
    }
    googleByDay.set(day, rows.length);
    rows.push({ ...toRow(record), message: googleMessage(1) });
  }
  return rows.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.id.localeCompare(a.id));
}

function googleMessage(calls: number): string {
  return `${calls} ${calls === 1 ? "call" : "calls"} from your Google profile. Google does not share who called.`;
}

// Filters

export const STATUS_FILTERS = ["all", "new", "contacted", "won", "lost"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SOURCE_FILTERS = ["all", "website", "ads", "google"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export interface Filters {
  readonly status: StatusFilter;
  readonly source: SourceFilter;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T {
  return typeof value === "string" ? (allowed.find((option) => option === value) ?? allowed[0] as T) : (allowed[0] as T);
}

/** The filters in the address; anything unknown means no filter. */
export function readFilters(params: { readonly status?: string | string[]; readonly source?: string | string[] }): Filters {
  return { status: oneOf(STATUS_FILTERS, params.status), source: oneOf(SOURCE_FILTERS, params.source) };
}

/** Taps are not a status the customer set, so they show under All and under their source only. */
export function filterRows(rows: readonly EnquiryRow[], filters: Filters): EnquiryRow[] {
  return rows.filter((row) => (filters.status === "all" || row.status === filters.status) && (filters.source === "all" || row.sourceGroup === filters.source));
}

/** The number beside each status chip, over the rows the source filter leaves. */
export function statusCounts(rows: readonly EnquiryRow[], source: SourceFilter): Readonly<Record<StatusFilter, number>> {
  const inSource = filterRows(rows, { status: "all", source });
  const count = (status: RowStatus): number => inSource.filter((row) => row.status === status).length;
  return { all: inSource.length, new: count("new"), contacted: count("contacted"), won: count("won"), lost: count("lost") };
}

/** Whether a Google chip is worth showing: only when Google calls exist. */
export function sourcesPresent(rows: readonly EnquiryRow[]): ReadonlySet<SourceGroup> {
  return new Set(rows.map((row) => row.sourceGroup));
}

// Figures

export interface ContactFigures {
  readonly call: number;
  readonly whatsapp: number;
  readonly form: number;
}

export interface Summary {
  /** People who wrote or called and have not been marked since, of any age in the rows read. */
  readonly waiting: number;
  /** When the oldest of them arrived. */
  readonly oldestWaiting: Date | null;
  /** Enquiries in the last 30 days, counted taps and Google calls included. */
  readonly received: number;
  /** Against the 30 days before; null when the rows read do not reach back that far. */
  readonly receivedChange: number | null;
  readonly won: number;
  readonly bestSource: { readonly group: SourceGroup; readonly count: number } | null;
  /** Calls from the Google profile in the last 30 days, already inside `received`. */
  readonly googleCalls: number;
  /** Calls, WhatsApp taps and forms in the last 30 days, or null while the website has reported none lately (ported). */
  readonly contacts: ContactFigures | null;
}

const sum = (rows: readonly EnquiryRow[]): number => rows.reduce((total, row) => total + row.count, 0);

/**
 * The figures above the list. `rows` are every row read (newest first); `complete` says the read reached back as far as it
 * was asked to, so the change against the 30 days before can be trusted.
 */
export function summarise(rows: readonly EnquiryRow[], now: Date, complete: boolean): Summary {
  const from = now.getTime() - WINDOW_DAYS * DAY_MS;
  const before = now.getTime() - 2 * DAY_MS * WINDOW_DAYS;
  const recent = rows.filter((row) => row.receivedAt.getTime() >= from);
  const previous = rows.filter((row) => row.receivedAt.getTime() < from && row.receivedAt.getTime() >= before);
  const waiting = rows.filter((row) => row.status === "new");
  const oldest = waiting.reduce<Date | null>((found, row) => (found === null || row.receivedAt < found ? row.receivedAt : found), null);

  const byGroup = new Map<SourceGroup, number>();
  for (const row of recent) byGroup.set(row.sourceGroup, (byGroup.get(row.sourceGroup) ?? 0) + row.count);
  const best = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    waiting: waiting.length,
    oldestWaiting: oldest,
    received: sum(recent),
    receivedChange: complete ? sum(recent) - sum(previous) : null,
    won: recent.filter((row) => row.status === "won").length,
    bestSource: best === undefined ? null : { group: best[0], count: best[1] },
    googleCalls: byGroup.get("google") ?? 0,
    contacts: measuredContacts(contactCounts(recent), contactCounts(rows.filter((row) => row.receivedAt.getTime() >= now.getTime() - MEASURED_DAYS * DAY_MS))),
  };
}

function contactCounts(rows: readonly EnquiryRow[]): ContactFigures {
  const of = (kind: EnquiryKind): number => rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.count, 0);
  return { call: of("call_tap"), whatsapp: of("whatsapp_tap"), form: of("form") };
}

const contactTotal = (counts: ContactFigures): number => counts.call + counts.whatsapp + counts.form;

/**
 * The contacts to show: the last 30 days' counts, or null while the website has reported nothing in the last 90 days (ported
 * from lib/site-contacts.ts). A website that is not reporting would otherwise show zeros nobody measured; once it reports any,
 * a quiet month is a real zero.
 */
export function measuredContacts(recent: ContactFigures, longer: ContactFigures): ContactFigures | null {
  return contactTotal(longer) === 0 && contactTotal(recent) === 0 ? null : recent;
}

/** "Waiting since yesterday", "Waiting since Tue 27 Oct"; null for today or a row not waiting. */
export function waitingLine(row: Pick<EnquiryRow, "status" | "receivedAt">, now: Date): string | null {
  if (row.status !== "new") return null;
  const relative = formatRelative(row.receivedAt, now);
  if (relative.startsWith("Today")) return null;
  return relative.startsWith("Yesterday") ? "Waiting since yesterday" : `Waiting since ${formatDate(row.receivedAt, now)}`;
}

/** "Oldest from yesterday", "Oldest from Tue 27 Oct". */
export function oldestLine(oldest: Date, now: Date): string {
  const relative = formatRelative(oldest, now);
  if (relative.startsWith("Today")) return "Oldest from today";
  return relative.startsWith("Yesterday") ? "Oldest from yesterday" : `Oldest from ${formatDate(oldest, now)}`;
}

// Links

/**
 * The phone as international digits for tel: and wa.me: a 10 digit Indian number gets 91 in front, one with a plus or 00 is
 * taken as written. Null when it is not a plausible number. shortcut: a number saved without a country code that is not 10
 * digits is used as typed, correct for the business to fix in its own contacts.
 */
export function internationalDigits(phone: string | null): string | null {
  if (phone === null) return null;
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!plus) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else {
      if (digits.startsWith("0")) digits = digits.slice(1);
      if (digits.length === 10) digits = `91${digits}`;
    }
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function telHref(phone: string | null): string | null {
  const digits = internationalDigits(phone);
  return digits === null ? null : `tel:+${digits}`;
}

export function whatsappHref(phone: string | null): string | null {
  const digits = internationalDigits(phone);
  return digits === null ? null : `https://wa.me/${digits}`;
}

export function mailHref(email: string | null): string | null {
  return email === null || !z.email().safeParse(email).success ? null : `mailto:${email}`;
}

// CSV

const FORMULA_START = /^[=@\t\r]/;
const PHONE_LIKE = /^[+-]?[\d\s()-]+$/;

/** One CSV cell, quoted. A cell a spreadsheet could read as a formula is prefixed with an apostrophe; a phone number is not. */
export function csvCell(value: string): string {
  const risky = FORMULA_START.test(value) || (/^[+-]/.test(value) && !PHONE_LIKE.test(value));
  return `"${(risky ? `'${value}` : value).replaceAll('"', '""')}"`;
}

function indiaTime(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

const STATUS_NAMES: Readonly<Record<RowStatus, string>> = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost", counted: "Counted" };

const CSV_HEAD = ["Received (India time)", "Name", "Phone", "Email", "Source", "Message", "Status", "Note"] as const;

/**
 * The export: one line per enquiry, newest first, with a byte order mark so a spreadsheet reads names in any script. Counted
 * rows keep their source and status and leave name, phone and email empty; nothing is invented for them.
 */
export function enquiriesCsv(records: readonly EnquiryRecord[]): string {
  const lines = [CSV_HEAD.map(csvCell).join(",")];
  for (const record of records) {
    const row = toRow(record);
    const person = !row.counted;
    lines.push(
      [
        indiaTime(row.receivedAt),
        person && row.title !== "Unnamed visitor" ? (record.name ?? "") : "",
        row.phone ?? "",
        row.email ?? "",
        row.source,
        person ? row.message : "",
        STATUS_NAMES[row.status],
        row.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

// Save form

export const saveEnquirySchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "contacted", "won", "lost"]),
  note: z
    .string()
    .max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters or fewer.`)
    .transform((note) => note.trim()),
});

// Chatbot (ported from apps/platform lib/chatbots-view.ts)

const STATUS_LINES: Readonly<Record<ChatbotStatus, { readonly label: string; readonly detail: string }>> = {
  setting_up: { label: "Setting up", detail: "The team is building and training it. You do not need to do anything." },
  live: { label: "Live", detail: "It is answering visitors on your site." },
  paused: { label: "Paused", detail: "It is switched off for now. Ask the team to turn it back on." },
};

/** A bot's status as a short label and a sentence under it. */
export function chatbotStatusLine(status: ChatbotStatus): { readonly label: string; readonly detail: string } {
  return STATUS_LINES[status];
}

/** What the page says about the price: OyeChats comes with the plan, so the customer never sees it as something to buy. */
export const OYECHATS_INCLUDED_LABEL = "Included in your plan";

const WARMTH: Readonly<Record<string, string>> = { sql: "Hot", sal: "Warm", mql: "Cool" };

/** How warm OyeChats rates a lead: "sql" Hot, "sal" Warm, "mql" Cool; null when unrated or a rating this page does not know. */
export function leadWarmth(tier: string | null): string | null {
  return tier === null ? null : (WARMTH[tier.toLowerCase()] ?? null);
}

/** A website address as people say it: no scheme and no trailing slash. */
export function websiteLabel(url: string | null): string | null {
  return url === null ? null : url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** "1 message" or "6 messages". */
export function messageCountLabel(count: number): string {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

/** What the conversation view says when the conversation could not be shown. */
export const CONVERSATION_NOTICES = {
  "not-found": "This conversation is no longer available.",
  unavailable: "The conversation is not available right now. Try again in a minute, or ask the team if it keeps happening.",
  limited: "You have opened a lot of conversations in a short time. Wait a minute and try again.",
  empty: "There are no messages in this conversation.",
} as const;

export type ConversationNoticeKey = keyof typeof CONVERSATION_NOTICES;

/** Who a message is from, in the words the view uses. */
export const MESSAGE_AUTHOR_LABELS = { visitor: "Visitor", assistant: "OyeChats", team: "Team" } as const;

export const CHATBOT_NAME_MAX = 80;

/** A name of 1 to 80 characters, spaces tidied (ported: parseChatbotName). */
export const chatbotNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Type a name for your assistant.").max(CHATBOT_NAME_MAX, `Keep the name to ${CHATBOT_NAME_MAX} characters or fewer.`));
