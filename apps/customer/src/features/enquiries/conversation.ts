import "server-only";
import { consumeRateLimit, findChatbotLeadForBusiness, findChatbotOperatorAccess, findEnquiry, withTenantScope } from "@brandbasket/db";
import { getAppDb, getStaffDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { fetchConversation, type ConversationMessage } from "./oyechats-api";
import { chatLeadId, leadWarmth } from "./rules";

/** Opening conversations is a person clicking; this stops a script from turning it into a flood towards OyeChats. */
export const CONVERSATION_OPENS = { limit: 60, windowSeconds: 60 } as const;

export type ConversationOutcome =
  | { readonly status: "ok"; readonly messages: readonly ConversationMessage[]; readonly warmth: string | null }
  | { readonly status: "not-found" }
  | { readonly status: "unavailable" }
  | { readonly status: "limited" };

/**
 * The messages behind one of the signed-in business's chat enquiries. The enquiry and its chat lead are found through
 * row-level security first, so an id that is not this business's is "not-found" before any credential is read. The session
 * asked of OyeChats is the one stored on the lead, never one the browser names. The operator key is staff-only, so it is read
 * on the staff connection (a sanctioned exception, see lib/db.ts) for that lead's own bot only.
 */
export async function loadEnquiryConversation(customer: Pick<CustomerContext, "tenant" | "businessId">, enquiryId: string): Promise<ConversationOutcome> {
  const found = await withTenantScope(getAppDb(), customer.tenant, async (tx) => {
    const enquiry = await findEnquiry(tx, enquiryId);
    const leadId = enquiry === null ? null : chatLeadId(enquiry);
    return leadId === null ? null : findChatbotLeadForBusiness(tx, customer.businessId, leadId);
  });
  if (found === null) return { status: "not-found" };

  const budget = await consumeRateLimit(getAppDb(), `oyechats-conversation:business:${customer.businessId}`, CONVERSATION_OPENS);
  if (!budget.allowed) return { status: "limited" };

  // Staff connection: the operator key table is staff-only. Reads the key of the bot that owns this business's lead.
  const access = await findChatbotOperatorAccess(getStaffDb(), found.lead.chatbotId);
  if (access === null) return { status: "unavailable" };

  const conversation = await fetchConversation(access, found.lead.sessionId);
  return conversation.status === "ok" ? { status: "ok", messages: conversation.messages, warmth: leadWarmth(found.lead.tier) } : conversation;
}
