"use server";

import { EnquiryNoteTooLongError, findEnquiry, updateEnquiry, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { CHATBOT_PATH, parseChatbotName } from "@/lib/chatbots-view";
import { ENQUIRIES_PATH, isCounted, NOTE_MAX, saveEnquirySchema } from "@/lib/enquiries/rules";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { loadLeadConversation } from "@/lib/server/chatbot-conversations";
import { renameCustomerChatbot } from "@/lib/server/chatbots";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { paymentRequiredState } from "@/lib/server/panel-form-errors";

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
  const customer = await requireWebsiteClient();
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
  const customer = await requireWebsiteClient("write");
  const parsed = parseChatbotName(name);
  if (!parsed.ok) return parsed;
  if (typeof chatbotId !== "string") return { ok: false, message: "We could not find that assistant." };
  const renamed = await renameCustomerChatbot(customer, chatbotId, parsed.name);
  if (!renamed) return { ok: false, message: "We could not find that assistant." };
  // Both pages show the name (the leads page names the bot when there are several), so the whole section is refreshed.
  revalidatePath(CHATBOT_PATH, "layout");
  return { ok: true, name: parsed.name };
}

const VIEWER_MESSAGE = "Only owners and editors can change this.";
const NOT_FOUND_MESSAGE = "We could not find that enquiry.";

/**
 * Saves the status and the private note of one enquiry, the only two things a customer may change. The business comes from
 * the session. A viewer and an unpaid business are refused here as well as by the database, and a counted row (a tap or a
 * profile call) has nothing to set.
 */
export async function saveEnquiryAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const { tenant, billing } = await requireWebsiteClient();
  if (!billing.hasAccess) return paymentRequiredState(formData);
  if (tenant.role === "viewer") return panelFormErrorState({ message: VIEWER_MESSAGE, field: null }, formData);
  const parsed = saveEnquirySchema.safeParse({ id: formData.get("id"), status: formData.get("status"), note: formData.get("note") ?? "" });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] === "note" ? "note" : null;
    return panelFormErrorState({ message: field === null ? NOT_FOUND_MESSAGE : (issue?.message ?? `Keep the note to ${NOTE_MAX} characters or fewer.`), field }, formData);
  }
  const { id, status, note } = parsed.data;
  try {
    const saved = await withTenantScope(getAppDb(), tenant, async (tx) => {
      const current = await findEnquiry(tx, id);
      if (current === null || isCounted(current)) return false;
      return (await updateEnquiry(tx, id, { status, note })) !== null;
    });
    if (!saved) return panelFormErrorState({ message: NOT_FOUND_MESSAGE, field: null }, formData);
  } catch (error) {
    if (error instanceof EnquiryNoteTooLongError) return panelFormErrorState({ message: `Keep the note to ${NOTE_MAX} characters or fewer.`, field: "note" }, formData);
    throw error;
  }
  revalidatePath(ENQUIRIES_PATH);
  return panelFormSavedState;
}
