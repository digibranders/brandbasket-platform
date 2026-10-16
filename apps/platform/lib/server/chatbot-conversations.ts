import "server-only";
import { consumeRateLimit, findChatbotLeadForBusiness, findChatbotOperatorAccess, withTenantScope, type Chatbot } from "@fynix/db";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { fetchConversation, fetchLeadActivity, type ConversationMessage, type LeadActivity } from "./oyechats-api";

/**
 * What the customer's OyeChats page reads from OyeChats itself: each lead's message count and last activity, and the messages
 * of one conversation. The conversations are not copied into Fynix. The key that reads them is a staff-only credential, so
 * these functions read it on the staff connection (a sanctioned exception, see lib/server/db.ts) and only ever for a bot that
 * the signed-in customer's own business owns.
 */

/** Opening conversations is a person clicking; this stops a script from turning it into a flood towards OyeChats. */
const CONVERSATION_OPENS = { limit: 60, windowSeconds: 60 } as const;

/**
 * For each of the customer's bots, its leads' activity by OyeChats session id; null for a bot whose conversations cannot be
 * read (no operator key yet, or OyeChats not reachable). The bots must come from a read made through the customer's own
 * tenant scope, so a bot of another business can never be named here.
 */
export async function loadBotActivity(
  bots: readonly Pick<Chatbot, "id">[],
): Promise<ReadonlyMap<string, ReadonlyMap<string, LeadActivity> | null>> {
  const staffDb = getStaffDb();
  const entries = await Promise.all(
    bots.map(async (bot) => {
      const access = await findChatbotOperatorAccess(staffDb, bot.id);
      return [bot.id, access === null ? null : await fetchLeadActivity(access)] as const;
    }),
  );
  return new Map(entries);
}

export type LeadConversationOutcome =
  | { readonly status: "ok"; readonly messages: readonly ConversationMessage[] }
  | { readonly status: "not-found" }
  | { readonly status: "unavailable" }
  | { readonly status: "limited" };

/**
 * The messages of one of the signed-in business's leads. The lead is found through row-level security first, so an id that is
 * not this business's is "not-found" before any credential is read; the session asked of OyeChats is the one stored for that
 * lead, never one the browser names.
 */
export async function loadLeadConversation(customer: Pick<GrantedCustomer, "tenant">, leadId: string): Promise<LeadConversationOutcome> {
  const { tenant } = customer;
  const found = await withTenantScope(getAppDb(), tenant, (tx) => findChatbotLeadForBusiness(tx, tenant.businessId, leadId));
  if (found === null) return { status: "not-found" };

  const budget = await consumeRateLimit(getAppDb(), `oyechats-conversation:business:${tenant.businessId}`, CONVERSATION_OPENS);
  if (!budget.allowed) return { status: "limited" };

  const access = await findChatbotOperatorAccess(getStaffDb(), found.lead.chatbotId);
  if (access === null) return { status: "unavailable" };

  const conversation = await fetchConversation(access, found.lead.sessionId);
  return conversation.status === "ok" ? { status: "ok", messages: conversation.messages } : conversation;
}
