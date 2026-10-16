import "server-only";
import { applyChatbotQualification, findChatbotWebhookTarget, recordChatbotLead } from "@fynix/db";
import { parseOyeChatsEvent, readOyeChatsBotId, verifyOyeChatsSignature } from "@fynix/shared/server/oyechats-webhook";
import { getStaffDb } from "./db";

/**
 * What an OyeChats delivery came to. `refused` is one answer for an unknown bot, a missing signature and a wrong one, so
 * the response never says which bot ids exist.
 */
export type OyeChatsWebhookResult = { readonly kind: "recorded" } | { readonly kind: "ignored" } | { readonly kind: "refused" };

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
      return { kind: "recorded" };
    case "qualification": {
      const rated = await applyChatbotQualification(staffDb, {
        chatbotId: target.chatbotId,
        sessionId: event.sessionId,
        tier: event.tier,
        score: event.score,
      });
      return rated ? { kind: "recorded" } : { kind: "ignored" };
    }
    case "ignored":
      return { kind: "ignored" };
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled OyeChats event ${JSON.stringify(unhandled)}`);
    }
  }
}
