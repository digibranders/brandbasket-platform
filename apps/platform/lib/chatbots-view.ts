import type { ChatbotStatus } from "@brandbasket/db";

/*
 * The words on the OyeChats page: where a bot is, what a captured lead shows, and how warm OyeChats rates it. Pure and
 * browser-safe, so the sentences are tested and the same ones are used wherever they appear.
 */

export const CHATBOT_PATH = "/oyechats";
export const CHATBOT_LEADS_PATH = `${CHATBOT_PATH}/leads`;
export const CHATBOT_NAME_PATH = `${CHATBOT_PATH}/name`;

/** What the page says about the price: OyeChats comes with the plan, so the customer never sees it as something to buy. */
export const OYECHATS_INCLUDED_LABEL = "Included in your plan";

const STATUS_LINES: Readonly<Record<ChatbotStatus, { readonly label: string; readonly detail: string }>> = {
  setting_up: { label: "Setting up", detail: "The team is building and training it. You do not need to do anything." },
  live: { label: "Live", detail: "It is answering visitors on your site." },
  paused: { label: "Paused", detail: "It is switched off for now. Ask the team to turn it back on." },
};

/** A bot's status as a short label and a sentence under it. */
export function chatbotStatusLine(status: ChatbotStatus): { readonly label: string; readonly detail: string } {
  return STATUS_LINES[status];
}

/**
 * A lead as a row: what to call them, then whatever else they left. The first detail they gave is the title, in the order
 * name, email, phone, company; the rest follow in that order.
 */
export function leadContactLines(lead: {
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
}): { readonly title: string; readonly lines: readonly string[] } {
  const given = [lead.name, lead.email, lead.phone, lead.company].filter((value): value is string => value !== null);
  const [title, ...lines] = given;
  return { title: title ?? "Unnamed visitor", lines };
}

/** A website address as people say it: no scheme and no trailing slash. */
export function websiteLabel(url: string | null): string | null {
  if (url === null) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** What a lead row and its pop-up need: the name to show, the rest of what they left, and the size of the conversation. */
export interface LeadTableRow {
  readonly id: string;
  readonly title: string;
  /** The rest of what they left (email, phone), shown at the top of the pop-up. */
  readonly lines: readonly string[];
  readonly initial: string;
  readonly company: string | null;
  readonly botName: string | null;
  /** The number of messages in the conversation; null when OyeChats could not be asked. */
  readonly messages: number | null;
}

/** The letter in a lead's avatar: the first letter or digit of the title, upper case; "?" when there is none. */
export function leadInitial(title: string): string {
  const match = /[\p{L}\p{N}]/u.exec(title);
  return match === null ? "?" : match[0].toUpperCase();
}

/** "1 message" or "6 messages". */
export function messageCountLabel(count: number): string {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

export interface LeadRowSource {
  readonly id: string;
  readonly chatbotId: string;
  readonly sessionId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
  readonly capturedAt: Date;
}

/**
 * The lead table's rows, in the order the leads are given (newest first, as the page reads them). A lead whose conversation
 * OyeChats could not report (no key yet, or OyeChats down) still gets a row, with no message count.
 */
export function buildLeadRows(
  leads: readonly LeadRowSource[],
  activityByBot: ReadonlyMap<string, ReadonlyMap<string, { readonly messages: number }> | null>,
  botNames: ReadonlyMap<string, string>,
): LeadTableRow[] {
  return leads.map((lead) => {
    const contact = leadContactLines(lead);
    const activity = activityByBot.get(lead.chatbotId)?.get(lead.sessionId) ?? null;
    return {
      id: lead.id,
      title: contact.title,
      lines: contact.lines.filter((line) => line !== lead.company),
      initial: leadInitial(contact.title),
      company: lead.company,
      botName: botNames.get(lead.chatbotId) ?? null,
      messages: activity === null ? null : activity.messages,
    };
  });
}

/** What the pop-up says when the conversation could not be shown. */
export const CONVERSATION_NOTICES = {
  "not-found": "This conversation is no longer available.",
  unavailable: "The conversation is not available right now. Try again in a minute, or ask the team if it keeps happening.",
  limited: "You have opened a lot of conversations in a short time. Wait a minute and try again.",
  empty: "There are no messages in this conversation.",
} as const;

export type ConversationNoticeKey = keyof typeof CONVERSATION_NOTICES;

/** Who a message is from, in the words the pop-up uses. */
export const MESSAGE_AUTHOR_LABELS = { visitor: "Visitor", assistant: "OyeChats", team: "Team" } as const;

const MAX_CHATBOT_NAME = 80;

/** What the rename box asks for: a name of 1 to 80 characters, spaces tidied. Anything else is refused with a sentence. */
export function parseChatbotName(value: unknown): { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string } {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (name === "") return { ok: false, message: "Type a name for your assistant." };
  if (name.length > MAX_CHATBOT_NAME) return { ok: false, message: `Keep the name to ${MAX_CHATBOT_NAME} characters or fewer.` };
  return { ok: true, name };
}

/** The page number a `?page=` in the address asks for: a whole number from 1, and 1 for anything else. */
export function readPageParam(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,5}$/.test(value)) return 1;
  return Number(value);
}

/** One place in the page controls: a page number, or a gap standing for the pages left out. */
export type PageItem = { readonly kind: "page"; readonly page: number } | { readonly kind: "gap"; readonly after: number };

const PAGE_WINDOW = 1;

/**
 * The page numbers to show: always the first and the last, the current page and one either side, and a gap in between where
 * pages are left out. A short list shows every page.
 */
export function paginationItems(page: number, pageCount: number): PageItem[] {
  const wanted = new Set<number>([1, pageCount]);
  for (let offset = -PAGE_WINDOW; offset <= PAGE_WINDOW; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pageCount) wanted.add(candidate);
  }
  const pages = [...wanted].sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((current, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && current - previous === 2) items.push({ kind: "page", page: previous + 1 });
    else if (previous !== undefined && current - previous > 2) items.push({ kind: "gap", after: previous });
    items.push({ kind: "page", page: current });
  });
  return items;
}

/** "Showing 11 to 20 of 23 leads". */
export function pageRangeLabel(page: number, perPage: number, total: number): string {
  if (total === 0) return "No leads";
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  return `Showing ${first} to ${last} of ${total} ${total === 1 ? "lead" : "leads"}`;
}

/**
 * Whether any lead's conversation could be read. False while no bot has an operator key and while OyeChats cannot be reached:
 * then there is no message count to show and nothing to open, and the lead table leaves both out.
 */
export function conversationsAvailable(rows: readonly Pick<LeadTableRow, "messages">[]): boolean {
  return rows.some((row) => row.messages !== null);
}
