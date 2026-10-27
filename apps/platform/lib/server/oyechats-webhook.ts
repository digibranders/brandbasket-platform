import "server-only";
import { applyChatbotQualification, findChatbotWebhookTarget, recordChatbotLead } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { parseOyeChatsEvent, readOyeChatsBotId, verifyOyeChatsSignature } from "@brandbasket/shared/server/oyechats-webhook";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";
import { alertTeams } from "./teams";
import { chatbotLeadTeamsCard } from "./teams-cards";

/** Tells the Teams enquiries channel a client's chatbot caught a lead. Best effort: never throws and never waits on Teams. */
function alertChatbotLead(businessId: string): void {
  try {
    void alertTeams("enquiries", chatbotLeadTeamsCard({ clientUrl: new URL(`/clients/${businessId}`, serverEnv().ADMIN_ORIGIN).toString() }));
  } catch (error) {
    console.error("A chatbot lead was saved but Teams could not be told about it.", errorLogInfo(error));
  }
}

/**
 * What an OyeChats delivery came to. `refused` is one answer for an unknown bot, a missing signature and a wrong one, so
 * the response never says which bot ids exist.
 */
export type OyeChatsWebhookResult =
  | { readonly kind: "recorded"; readonly businessId: string }
  | { readonly kind: "ignored" }
  | { readonly kind: "refused" };

const REFUSED: OyeChatsWebhookResult = { kind: "refused" };

/**
 * Handles one signed delivery from OyeChats (POST /api/webhooks/oyechats). The body is read as raw text because the
 * signature covers the exact bytes. The bot is found from the body, but nothing in the body is believed until the signature
 * checks out under that bot's own secret; the business a lead goes to comes from our record of the bot, never from the body.
 *
 * Runs on the staff connection: the sender has no session, and customers never write bots or leads through their own
 * connection (see the comment in lib/server/db.ts).
 */
export async function handleOyeChatsWebhook(rawBody: string, signature: string | null): Promise<OyeChatsWebhookResult> {
  const botId = readOyeChatsBotId(rawBody);
  if (botId === null || signature === null) return REFUSED;
  const staffDb = getStaffDb();
  const target = await findChatbotWebhookTarget(staffDb, botId);
  if (target === null || !verifyOyeChatsSignature(rawBody, signature, target.secret)) return REFUSED;

  const event = parseOyeChatsEvent(rawBody);
  switch (event.kind) {
    case "lead":
      await recordChatbotLead(staffDb, {
        chatbotId: target.chatbotId,
        businessId: target.businessId,
        sessionId: event.sessionId,
        name: event.name,
        email: event.email,
        phone: event.phone,
        company: event.company,
        capturedAt: event.occurredAt,
      });
      alertChatbotLead(target.businessId);
      return { kind: "recorded", businessId: target.businessId };
    case "qualification": {
      const rated = await applyChatbotQualification(staffDb, {
        chatbotId: target.chatbotId,
        sessionId: event.sessionId,
        tier: event.tier,
        score: event.score,
      });
      return rated ? { kind: "recorded", businessId: target.businessId } : { kind: "ignored" };
    }
    case "ignored":
      return { kind: "ignored" };
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled OyeChats event ${JSON.stringify(unhandled)}`);
    }
  }
}
