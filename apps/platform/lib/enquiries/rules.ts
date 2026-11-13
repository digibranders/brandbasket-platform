import type { Enquiry, EnquiryKind } from "@brandbasket/db";
import { z } from "zod";

/*
 * The unified enquiries list as pure rules: which rows are people and which are only counted, the words and links on a row,
 * the filters, the figures above the list and the CSV. No I/O here. Ported from the customer rebuild's
 * features/enquiries/rules.ts (never imported from it).
 */

export const ENQUIRIES_PATH = "/website/enquiries";
export const EXPORT_PATH = "/website/enquiries/export";

/** The list and the figures cover this many days. */
export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000;

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
  /** The OyeChats lead behind a chat enquiry, whose conversation can be opened; null for any other kind. */
  readonly chatLeadId: string | null;
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

const CHAT_REF = "chatbot_lead:";

/** The kinds that come from a person who left something. Used to find who is still waiting for a reply. */
export const PERSON_KINDS = ["chat", "form", "ad_lead"] as const satisfies readonly EnquiryKind[];

/**
 * Whether an enquiry has no identity to reply to: taps and Google profile calls, and a form that arrived without any detail
 * (while form contents are not stored, every form is only counted).
 */
export function isCounted(e: Pick<EnquiryRecord, "kind" | "name" | "phone" | "email" | "message">): boolean {
  if (e.kind === "call_tap" || e.kind === "whatsapp_tap" || e.kind === "google_call") return true;
  return e.kind === "form" && e.name === null && e.phone === null && e.email === null && e.message === null;
}

/** What a person is called: the first of name, email and phone they left, else "Unnamed visitor". */
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
    chatLeadId: chatLeadId(e),
  };
}

const istDay = (date: Date): string => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

function googleMessage(calls: number): string {
  return `${calls} ${calls === 1 ? "call" : "calls"} from your Google profile. Google does not share who called.`;
}

/**
 * The list's rows, newest first. Google does not say who called, so its profile calls are shown as one row per India day with
 * the number of calls, never as one invented person per call.
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

// Filters

export const STATUS_FILTERS = ["all", "new", "contacted", "won", "lost"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SOURCE_FILTERS = ["all", "website", "ads", "google"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export interface Filters {
  readonly status: StatusFilter;
  readonly source: SourceFilter;
}

export const STATUS_FILTER_LABELS: Readonly<Record<StatusFilter, string>> = { all: "All", new: "New", contacted: "Contacted", won: "Won", lost: "Lost" };
export const SOURCE_FILTER_LABELS: Readonly<Record<SourceFilter, string>> = { all: "All sources", website: "Website", ads: "Ads", google: "Google" };

function oneOf<T extends string>(allowed: readonly T[], fallback: T, value: string | string[] | undefined): T {
  return typeof value === "string" ? (allowed.find((option) => option === value) ?? fallback) : fallback;
}

/** The filters in the address; anything unknown means no filter. */
export function readFilters(params: { readonly status?: string | string[]; readonly source?: string | string[] }): Filters {
  return { status: oneOf(STATUS_FILTERS, "all", params.status), source: oneOf(SOURCE_FILTERS, "all", params.source) };
}

/** Counted rows (taps and Google calls) are not a status the customer set, so they show under All and under their source only. */
export function filterRows(rows: readonly EnquiryRow[], filters: Filters): EnquiryRow[] {
  return rows.filter((row) => (filters.status === "all" || row.status === filters.status) && (filters.source === "all" || row.sourceGroup === filters.source));
}

/** The number beside each status chip, over the rows the source filter leaves. */
export function statusCounts(rows: readonly EnquiryRow[], source: SourceFilter): Readonly<Record<StatusFilter, number>> {
  const inSource = filterRows(rows, { status: "all", source });
  const count = (status: RowStatus): number => inSource.filter((row) => row.status === status).length;
  return { all: inSource.length, new: count("new"), contacted: count("contacted"), won: count("won"), lost: count("lost") };
}

/** The address of the list with these filters; a default filter is left out of it. */
export function filtersHref(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.status !== "all") query.set("status", filters.status);
  if (filters.source !== "all") query.set("source", filters.source);
  const text = query.toString();
  return text === "" ? ENQUIRIES_PATH : `${ENQUIRIES_PATH}?${text}`;
}

// Figures

export interface Summary {
  /** People who wrote or left details and have not been marked since, of any age in the rows read. */
  readonly waiting: number;
  /** Enquiries in the last 30 days, counted taps and Google calls included. */
  readonly received: number;
  /** Enquiries marked won among those received in the last 30 days. */
  readonly won: number;
}

/** The figures above the list. `rows` are every row read. */
export function summarise(rows: readonly EnquiryRow[], now: Date): Summary {
  const from = now.getTime() - WINDOW_DAYS * DAY_MS;
  const recent = rows.filter((row) => row.receivedAt.getTime() >= from);
  return {
    waiting: rows.filter((row) => row.status === "new").length,
    received: recent.reduce((total, row) => total + row.count, 0),
    won: recent.filter((row) => row.status === "won").length,
  };
}

// Links

/**
 * The phone as international digits for tel: and wa.me: a 10 digit Indian number gets 91 in front, one with a plus or 00 is
 * taken as written. Null when it is not a plausible number. shortcut: a number saved without a country code that is not 10
 * digits is used as typed; fine, the business can correct it in its own contacts.
 */
export function internationalDigits(phone: string | null): string | null {
  if (phone === null) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
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
    lines.push(
      [
        indiaTime(row.receivedAt),
        row.counted ? "" : (record.name ?? ""),
        row.phone ?? "",
        row.email ?? "",
        row.source,
        row.counted ? "" : row.message,
        STATUS_NAMES[row.status],
        row.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The file name of the export: today's date in India. */
export function exportFileName(now: Date): string {
  return `enquiries-${istDay(now)}.csv`;
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
