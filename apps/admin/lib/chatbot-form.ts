import { chatbotStatus, type ChatbotStatus } from "@fynix/db";

/*
 * The client page's Chatbot section: what staff may type for a bot and the fixed words said back (`?chatbots=`). The address
 * picks a message by key and nothing from it is ever shown. The webhook secret and the operator key are write-only: neither
 * is displayed again.
 */

const MAX_NAME = 80;
const MIN_SECRET = 16;
const MAX_SECRET = 200;
const MAX_BOT_ID_DIGITS = 9;
// The same rule as the chatbots_website_url_check constraint, so a refusal reads as a message and not a database error.
const WEBSITE = /^https?:\/\/[^\s]{1,255}$/;

export type ChatbotNotice =
  | "added"
  | "status-saved"
  | "removed"
  | "not-found"
  | "unconfirmed"
  | "bot-id-taken"
  | "invalid-name"
  | "invalid-bot-id"
  | "invalid-website"
  | "invalid-secret"
  | "invalid-operator-key"
  | "key-saved"
  | "key-cleared"
  | "invalid-status";

export const CHATBOT_NOTICES: Readonly<Record<ChatbotNotice, { readonly text: string; readonly ok: boolean }>> = {
  added: { text: "OyeChats bot added. Its leads now reach the customer’s dashboard once OyeChats sends them.", ok: true },
  "status-saved": { text: "Status saved. The customer sees it on their OyeChats page.", ok: true },
  removed: { text: "OyeChats bot removed, with its leads and its webhook secret.", ok: true },
  "not-found": { text: "Nothing changed: that bot could not be found.", ok: false },
  unconfirmed: { text: "Nothing changed: tick the box to confirm the removal.", ok: false },
  "bot-id-taken": { text: "Nothing added: another bot already uses that OyeChats bot number.", ok: false },
  "invalid-name": { text: "Nothing added: give the bot a name of up to 80 characters.", ok: false },
  "invalid-bot-id": { text: "Nothing added: the OyeChats bot number is the whole number OyeChats shows for the bot.", ok: false },
  "invalid-website": { text: "Nothing added: the website must be a full address starting with http:// or https://.", ok: false },
  "invalid-secret": { text: "Nothing added: paste the whole webhook secret OyeChats shows, with no spaces (at least 16 characters).", ok: false },
  "invalid-operator-key": { text: "Nothing saved: paste the whole operator key OyeChats gave you, with no spaces (at least 16 characters).", ok: false },
  "key-saved": { text: "Operator key saved. The customer can now open a lead and read the conversation.", ok: true },
  "key-cleared": { text: "Operator key removed. The customer still sees their leads but cannot open the conversations.", ok: true },
  "invalid-status": { text: "Nothing changed: choose a status from the list.", ok: false },
};

export interface ChatbotFormValues {
  readonly name: string;
  readonly oyechatsBotId: number;
  readonly websiteUrl: string | null;
  readonly webhookSecret: string;
  /** The key of the OyeChats operator bound to this bot; null when staff have not got it yet. */
  readonly operatorKey: string | null;
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseChatbotForm(data: FormData): { readonly ok: true; readonly bot: ChatbotFormValues } | { readonly ok: false; readonly notice: ChatbotNotice } {
  const name = text(data, "name").replace(/\s+/g, " ");
  if (name === "" || name.length > MAX_NAME) return { ok: false, notice: "invalid-name" };

  const botId = text(data, "oyechatsBotId");
  if (!new RegExp(`^[1-9][0-9]{0,${MAX_BOT_ID_DIGITS - 1}}$`).test(botId)) return { ok: false, notice: "invalid-bot-id" };

  const website = text(data, "websiteUrl");
  if (website !== "" && !WEBSITE.test(website)) return { ok: false, notice: "invalid-website" };

  const secret = text(data, "webhookSecret");
  if (!isCredential(secret)) return { ok: false, notice: "invalid-secret" };

  const operatorKey = text(data, "operatorKey");
  if (operatorKey !== "" && !isCredential(operatorKey)) return { ok: false, notice: "invalid-operator-key" };

  return {
    ok: true,
    bot: { name, oyechatsBotId: Number(botId), websiteUrl: website === "" ? null : website, webhookSecret: secret, operatorKey: operatorKey === "" ? null : operatorKey },
  };
}

/** What the operator-key form asks for: save the key typed, or take the stored one away. */
export type OperatorKeyChange =
  | { readonly ok: true; readonly operatorKey: string | null }
  | { readonly ok: false; readonly notice: ChatbotNotice };

export function parseOperatorKeyForm(data: FormData): OperatorKeyChange {
  if (data.get("intent") === "clear") return { ok: true, operatorKey: null };
  const operatorKey = text(data, "operatorKey");
  return isCredential(operatorKey) ? { ok: true, operatorKey } : { ok: false, notice: "invalid-operator-key" };
}

/** A pasted secret or key: 16 to 200 characters with no whitespace, the same rule the database holds. */
function isCredential(value: string): boolean {
  return value.length >= MIN_SECRET && value.length <= MAX_SECRET && !/\s/.test(value);
}

/** A status the form named, or null for anything else. */
export function readChatbotStatus(value: FormDataEntryValue | null): ChatbotStatus | null {
  return typeof value === "string" ? (chatbotStatus.enumValues.find((status) => status === value) ?? null) : null;
}

export function chatbotNoticeHref(businessId: string, notice: ChatbotNotice): string {
  return `/clients/${businessId}?chatbots=${notice}#chatbots`;
}

/** The notice the address names, or null. */
export function readChatbotNotice(value: string | string[] | undefined): ChatbotNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(CHATBOT_NOTICES, value) ? (value as ChatbotNotice) : null;
}
