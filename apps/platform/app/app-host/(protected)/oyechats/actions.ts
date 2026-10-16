"use server";

import { revalidatePath } from "next/cache";
import { CHATBOT_PATH, parseChatbotName } from "@/lib/chatbots-view";
import { loadLeadConversation } from "@/lib/server/chatbot-conversations";
import { renameCustomerChatbot } from "@/lib/server/chatbots";
import { requireCustomerAccess } from "@/lib/server/customer-access";

/** A message as the browser gets it: plain strings only, the time as an ISO moment. */
export interface OpenedMessage {
  readonly author: "visitor" | "assistant" | "team";
  readonly text: string;
  readonly at: string | null;
}

export type OpenedConversation =
  | { readonly status: "ok"; readonly messages: readonly OpenedMessage[] }
  | { readonly status: "not-found" | "unavailable" | "limited" };

/**
 * Opens one lead's conversation for the OyeChats page's pop-up. The browser names only the lead; which business it belongs
 * to, which OyeChats session it is and the key that reads it all come from the server (lib/server/chatbot-conversations.ts).
 */
export async function openLeadConversationAction(leadId: string): Promise<OpenedConversation> {
  const customer = await requireCustomerAccess();
  if (typeof leadId !== "string") return { status: "not-found" };
  const outcome = await loadLeadConversation(customer, leadId);
  if (outcome.status !== "ok") return { status: outcome.status };
  return {
    status: "ok",
    messages: outcome.messages.map((message) => ({ author: message.author, text: message.text, at: message.at === null ? null : message.at.toISOString() })),
  };
}

export type RenameResult = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string };

/**
 * Renames one of the customer's assistants, the name they see on this page. The browser names the bot and the new name; which
 * business it must belong to comes from the signed-in session.
 */
export async function renameChatbotAction(chatbotId: string, name: string): Promise<RenameResult> {
  const customer = await requireCustomerAccess();
  const parsed = parseChatbotName(name);
  if (!parsed.ok) return parsed;
  if (typeof chatbotId !== "string") return { ok: false, message: "We could not find that assistant." };
  const renamed = await renameCustomerChatbot(customer, chatbotId, parsed.name);
  if (!renamed) return { ok: false, message: "We could not find that assistant." };
  // Both pages show the name (the leads page names the bot when there are several), so the whole section is refreshed.
  revalidatePath(CHATBOT_PATH, "layout");
  return { ok: true, name: parsed.name };
}
