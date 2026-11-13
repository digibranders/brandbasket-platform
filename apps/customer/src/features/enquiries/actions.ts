"use server";

import { EnquiryNoteTooLongError, findEnquiry, renameChatbot, updateEnquiry, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { parseForm } from "@/lib/form";
import { requirePaid, requireWebsite } from "@/lib/guards";
import { loadEnquiryConversation } from "./conversation";
import { chatbotNameSchema, CONVERSATION_NOTICES, ENQUIRIES_PATH, isCounted, saveEnquirySchema } from "./rules";

const VIEWER_MESSAGE = "Only owners and editors can change this.";

/**
 * Saves the status and the private note of one enquiry, the only two things a customer may change. A viewer is refused here
 * as well as by the database. A counted row (a tap or a profile call) has nothing to set.
 */
export async function saveEnquiryAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requirePaid({ write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = parseForm(saveEnquirySchema, formData);
  if (!parsed.ok) return parsed;
  const { id, status, note } = parsed.data;
  try {
    const saved = await withTenantScope(getAppDb(), customer.tenant, async (tx) => {
      const current = await findEnquiry(tx, id);
      if (current === null || isCounted(current)) return false;
      return (await updateEnquiry(tx, id, { status, note })) !== null;
    });
    if (!saved) return actionFail("We could not find that enquiry.");
  } catch (error) {
    if (error instanceof EnquiryNoteTooLongError) return actionFail("Check the fields marked below.", { note: "Keep the note to 1000 characters or fewer." });
    throw error;
  }
  revalidatePath(ENQUIRIES_PATH);
  return actionOk();
}

export interface OpenedMessage {
  readonly author: "visitor" | "assistant" | "team";
  readonly text: string;
  /** An ISO moment, or null. */
  readonly at: string | null;
}

export interface OpenedConversation {
  readonly messages: readonly OpenedMessage[];
  /** "Hot", "Warm" or "Cool"; null until OyeChats rates the lead. */
  readonly warmth: string | null;
}

const enquiryIdSchema = z.uuid();

/**
 * Opens the conversation behind one chat enquiry. The browser names only the enquiry; the business, the OyeChats session and
 * the key that reads it all come from the server. A refusal carries the sentence the view says.
 */
export async function openConversationAction(enquiryId: string): Promise<ActionResult<OpenedConversation>> {
  const customer = await requirePaid();
  const id = enquiryIdSchema.safeParse(enquiryId);
  if (!id.success) return actionFail(CONVERSATION_NOTICES["not-found"]);
  const outcome = await loadEnquiryConversation(customer, id.data);
  if (outcome.status !== "ok") return actionFail(CONVERSATION_NOTICES[outcome.status]);
  return actionOk({
    warmth: outcome.warmth,
    messages: outcome.messages.map((message) => ({ author: message.author, text: message.text, at: message.at === null ? null : message.at.toISOString() })),
  });
}

const renameSchema = z.object({ chatbotId: z.uuid(), name: chatbotNameSchema });

/** Renames one of the customer's assistants, the name they see on this page. The business comes from the session. */
export async function renameChatbotAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = parseForm(renameSchema, formData);
  if (!parsed.ok) return parsed;
  const renamed = await withTenantScope(getAppDb(), customer.tenant, (tx) =>
    renameChatbot(tx, { chatbotId: parsed.data.chatbotId, businessId: customer.businessId, name: parsed.data.name }),
  );
  if (!renamed) return actionFail("We could not find that assistant.");
  revalidatePath(ENQUIRIES_PATH);
  return actionOk();
}
