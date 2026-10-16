import "server-only";
import {
  ChatbotBotIdTakenError,
  listChatbotsForStaff,
  registerChatbot,
  removeChatbot,
  setChatbotOperatorKey,
  setChatbotStatus,
  type ChatbotForStaff,
  type ChatbotStatus,
} from "@fynix/db";
import type { ChatbotFormValues } from "@/lib/chatbot-form";
import { getStaffDb } from "./db";

/**
 * Staff work on a client's chatbots: what the client page lists, registering a bot with the webhook secret OyeChats made for
 * it, moving its status on, and removing it. Every function assumes the caller has already checked the signed-in staff
 * member (requireStaffAccess), as the client page's other server modules do, and names the business it acts on.
 */

export async function loadClientChatbots(businessId: string): Promise<ChatbotForStaff[]> {
  return listChatbotsForStaff(getStaffDb(), businessId);
}

/** Registers a bot for the business. `bot-id-taken` when another bot already uses that OyeChats bot number. */
export async function addClientChatbot(businessId: string, values: ChatbotFormValues): Promise<"added" | "bot-id-taken"> {
  try {
    await registerChatbot(getStaffDb(), {
      businessId,
      name: values.name,
      oyechatsBotId: values.oyechatsBotId,
      websiteUrl: values.websiteUrl,
      webhookSecret: values.webhookSecret,
      operatorKey: values.operatorKey,
    });
    return "added";
  } catch (error) {
    if (error instanceof ChatbotBotIdTakenError) return "bot-id-taken";
    throw error;
  }
}

/** Sets a bot's status, only for the business that owns it. False when no such bot. */
export async function setClientChatbotStatus(businessId: string, chatbotId: string, status: ChatbotStatus): Promise<boolean> {
  return setChatbotStatus(getStaffDb(), { chatbotId, businessId, status });
}

/** Saves, or with null removes, the key that lets the dashboard read a bot's conversations, only for the business that owns it. False when no such bot. */
export async function setClientChatbotOperatorKey(businessId: string, chatbotId: string, operatorKey: string | null): Promise<boolean> {
  return setChatbotOperatorKey(getStaffDb(), { chatbotId, businessId, operatorKey });
}

/** Removes a bot with its leads and its secret, only for the business that owns it. False when no such bot. */
export async function removeClientChatbot(businessId: string, chatbotId: string): Promise<boolean> {
  return removeChatbot(getStaffDb(), { chatbotId, businessId });
}
