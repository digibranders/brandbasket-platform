import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { chatbotLeads, chatbots, chatbotWebhookSecrets, type Chatbot, type ChatbotLead, type ChatbotStatus } from "../schema";
import { hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

/** Reads run on their own and inside a tenant-scoped transaction, so they accept either runner. */
type Runner = Database | ScopedTransaction;

/** Another bot already uses that OyeChats bot, so the webhook could not tell which business a lead belongs to. */
export class ChatbotBotIdTakenError extends Error {
  constructor(oyechatsBotId: number) {
    super(`OyeChats bot ${oyechatsBotId} is already registered`);
    this.name = "ChatbotBotIdTakenError";
  }
}

export interface NewChatbot {
  readonly businessId: string;
  readonly name: string;
  readonly oyechatsBotId: number;
  readonly websiteUrl: string | null;
  /** The secret OyeChats made for this bot's webhook. Kept where only staff can read it. */
  readonly webhookSecret: string;
  /** The key of the OyeChats operator bound to this bot, used to read its conversations. Null when staff have none yet. */
  readonly operatorKey: string | null;
}

/** Registers a bot for a business, with its webhook secret, together or not at all. Staff connection only. */
export async function registerChatbot(db: Database, input: NewChatbot): Promise<Chatbot> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .insert(chatbots)
        .values({ businessId: input.businessId, name: input.name, oyechatsBotId: input.oyechatsBotId, websiteUrl: input.websiteUrl })
        .returning();
      const created = rows[0];
      if (created === undefined) throw new Error("Inserting a chatbot returned no row");
      await tx.insert(chatbotWebhookSecrets).values({ chatbotId: created.id, secret: input.webhookSecret, operatorKey: input.operatorKey });
      return created;
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new ChatbotBotIdTakenError(input.oyechatsBotId);
    throw error;
  }
}

/** The business's bots, oldest first. Works through row-level security, so a customer sees only their own. */
export async function listChatbotsForBusiness(db: Runner, businessId: string): Promise<Chatbot[]> {
  if (!isUuid(businessId)) return [];
  return db.select().from(chatbots).where(eq(chatbots.businessId, businessId)).orderBy(asc(chatbots.createdAt), asc(chatbots.id));
}

/** A bot with how many leads it has collected and whether it has an operator key, for the staff page. The key itself is never listed. */
export type ChatbotForStaff = Chatbot & { readonly leadCount: number; readonly hasOperatorKey: boolean };

/** The business's bots, oldest first, each with its lead count. Staff connection. */
export async function listChatbotsForStaff(db: Runner, businessId: string): Promise<ChatbotForStaff[]> {
  const bots = await listChatbotsForBusiness(db, businessId);
  if (bots.length === 0) return [];
  const counts = await db
    .select({ chatbotId: chatbotLeads.chatbotId, total: sql<number>`count(*)::int` })
    .from(chatbotLeads)
    .where(eq(chatbotLeads.businessId, businessId))
    .groupBy(chatbotLeads.chatbotId);
  const countOf = new Map(counts.map((row) => [row.chatbotId, row.total] as const));
  const withKey = await db
    .select({ chatbotId: chatbotWebhookSecrets.chatbotId })
    .from(chatbotWebhookSecrets)
    .innerJoin(chatbots, eq(chatbots.id, chatbotWebhookSecrets.chatbotId))
    .where(and(eq(chatbots.businessId, businessId), isNotNull(chatbotWebhookSecrets.operatorKey)));
  const hasKey = new Set(withKey.map((row) => row.chatbotId));
  return bots.map((bot) => ({ ...bot, leadCount: countOf.get(bot.id) ?? 0, hasOperatorKey: hasKey.has(bot.id) }));
}

/** A lead with the OyeChats number of the bot that collected it. */
export interface ChatbotLeadWithBot {
  readonly lead: ChatbotLead;
  readonly oyechatsBotId: number;
}

/**
 * One of the business's leads, with its bot's OyeChats number, or null when the id is not one of this business's leads. Works
 * through row-level security, so a customer can only ever find their own.
 */
export async function findChatbotLeadForBusiness(db: Runner, businessId: string, leadId: string): Promise<ChatbotLeadWithBot | null> {
  if (!isUuid(businessId) || !isUuid(leadId)) return null;
  const rows = await db
    .select({ lead: chatbotLeads, oyechatsBotId: chatbots.oyechatsBotId })
    .from(chatbotLeads)
    .innerJoin(chatbots, eq(chatbots.id, chatbotLeads.chatbotId))
    .where(and(eq(chatbotLeads.id, leadId), eq(chatbotLeads.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The key to read one bot's conversations in OyeChats, with the bot's OyeChats number. */
export interface ChatbotOperatorAccess {
  readonly oyechatsBotId: number;
  readonly operatorKey: string;
}

/** A bot's OyeChats number and operator key, or null when the bot is unknown or has no key. Staff connection only. */
export async function findChatbotOperatorAccess(db: Runner, chatbotId: string): Promise<ChatbotOperatorAccess | null> {
  if (!isUuid(chatbotId)) return null;
  const rows = await db
    .select({ oyechatsBotId: chatbots.oyechatsBotId, operatorKey: chatbotWebhookSecrets.operatorKey })
    .from(chatbots)
    .innerJoin(chatbotWebhookSecrets, eq(chatbotWebhookSecrets.chatbotId, chatbots.id))
    .where(eq(chatbots.id, chatbotId))
    .limit(1);
  const row = rows[0];
  return row === undefined || row.operatorKey === null ? null : { oyechatsBotId: row.oyechatsBotId, operatorKey: row.operatorKey };
}

/** Sets, or with null clears, a bot's operator key, only if the bot is that business's. False when nothing matched. Staff connection only. */
export async function setChatbotOperatorKey(
  db: Runner,
  input: { readonly chatbotId: string; readonly businessId: string; readonly operatorKey: string | null },
): Promise<boolean> {
  if (!isUuid(input.chatbotId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(chatbotWebhookSecrets)
    .set({ operatorKey: input.operatorKey })
    .where(
      and(
        eq(chatbotWebhookSecrets.chatbotId, input.chatbotId),
        inArray(
          chatbotWebhookSecrets.chatbotId,
          db.select({ id: chatbots.id }).from(chatbots).where(and(eq(chatbots.id, input.chatbotId), eq(chatbots.businessId, input.businessId))),
        ),
      ),
    )
    .returning({ chatbotId: chatbotWebhookSecrets.chatbotId });
  return rows.length > 0;
}

/**
 * The business's leads, newest first, at most `limit`, after skipping the first `offset`. Works through row-level security.
 * The order is total (time, then id), so a page boundary never repeats or drops a lead.
 */
export async function listChatbotLeadsForBusiness(db: Runner, businessId: string, limit: number, offset = 0): Promise<ChatbotLead[]> {
  if (!isUuid(businessId)) return [];
  return db
    .select()
    .from(chatbotLeads)
    .where(eq(chatbotLeads.businessId, businessId))
    .orderBy(desc(chatbotLeads.capturedAt), desc(chatbotLeads.id))
    .limit(limit)
    .offset(offset);
}

/** How many leads the business has in all. Works through row-level security. */
export async function countChatbotLeadsForBusiness(db: Runner, businessId: string): Promise<number> {
  if (!isUuid(businessId)) return 0;
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(chatbotLeads).where(eq(chatbotLeads.businessId, businessId));
  return rows[0]?.total ?? 0;
}

/** Changes a bot's status, only if it is that business's. False when nothing matched. Staff connection only. */
export async function setChatbotStatus(
  db: Runner,
  input: { readonly chatbotId: string; readonly businessId: string; readonly status: ChatbotStatus },
): Promise<boolean> {
  if (!isUuid(input.chatbotId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(chatbots)
    .set({ status: input.status })
    .where(and(eq(chatbots.id, input.chatbotId), eq(chatbots.businessId, input.businessId)))
    .returning({ id: chatbots.id });
  return rows.length > 0;
}

/**
 * Renames a bot, only if it is that business's. False when nothing matched. The customer's own connection may run this (0179
 * grants it the name and nothing else): it is how a customer changes what they call their bot.
 */
export async function renameChatbot(
  db: Runner,
  input: { readonly chatbotId: string; readonly businessId: string; readonly name: string },
): Promise<boolean> {
  if (!isUuid(input.chatbotId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(chatbots)
    .set({ name: input.name })
    .where(and(eq(chatbots.id, input.chatbotId), eq(chatbots.businessId, input.businessId)))
    .returning({ id: chatbots.id });
  return rows.length > 0;
}

/** Removes a bot with its secret and its leads, only if it is that business's. False when nothing matched. Staff connection only. */
export async function removeChatbot(db: Database, input: { readonly chatbotId: string; readonly businessId: string }): Promise<boolean> {
  if (!isUuid(input.chatbotId) || !isUuid(input.businessId)) return false;
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: chatbots.id })
      .from(chatbots)
      .where(and(eq(chatbots.id, input.chatbotId), eq(chatbots.businessId, input.businessId)))
      .limit(1)
      .for("update");
    if (owned.length === 0) return false;
    await tx.delete(chatbotLeads).where(eq(chatbotLeads.chatbotId, input.chatbotId));
    await tx.delete(chatbotWebhookSecrets).where(eq(chatbotWebhookSecrets.chatbotId, input.chatbotId));
    await tx.delete(chatbots).where(eq(chatbots.id, input.chatbotId));
    return true;
  });
}

/** Deletes every bot, secret and lead of a business: part of erasing an account. Staff connection only. */
export async function eraseChatbotsOfBusiness(db: Runner, businessId: string): Promise<void> {
  const ids = (await db.select({ id: chatbots.id }).from(chatbots).where(eq(chatbots.businessId, businessId))).map((row) => row.id);
  await db.delete(chatbotLeads).where(eq(chatbotLeads.businessId, businessId));
  for (const id of ids) await db.delete(chatbotWebhookSecrets).where(eq(chatbotWebhookSecrets.chatbotId, id));
  await db.delete(chatbots).where(eq(chatbots.businessId, businessId));
}

export interface ChatbotWebhookTarget {
  readonly chatbotId: string;
  readonly businessId: string;
  readonly secret: string;
}

/** Which bot an OyeChats webhook is for, with the secret its signature must match. Null for a bot we do not know. Staff connection only. */
export async function findChatbotWebhookTarget(db: Runner, oyechatsBotId: number): Promise<ChatbotWebhookTarget | null> {
  if (!Number.isSafeInteger(oyechatsBotId) || oyechatsBotId <= 0) return null;
  const rows = await db
    .select({ chatbotId: chatbots.id, businessId: chatbots.businessId, secret: chatbotWebhookSecrets.secret })
    .from(chatbots)
    .innerJoin(chatbotWebhookSecrets, eq(chatbotWebhookSecrets.chatbotId, chatbots.id))
    .where(eq(chatbots.oyechatsBotId, oyechatsBotId))
    .limit(1);
  return rows[0] ?? null;
}

export interface ChatbotLeadInput {
  readonly chatbotId: string;
  readonly businessId: string;
  readonly sessionId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
  readonly capturedAt: Date;
}

/**
 * Records a lead once per chat session. A redelivery, or a second delivery for the same session with more details, fills
 * in what was missing and never blanks what is already there. Staff connection only.
 */
export async function recordChatbotLead(db: Runner, input: ChatbotLeadInput): Promise<void> {
  await db
    .insert(chatbotLeads)
    .values(input)
    .onConflictDoUpdate({
      target: [chatbotLeads.chatbotId, chatbotLeads.sessionId],
      set: {
        name: sql`coalesce(excluded.name, ${chatbotLeads.name})`,
        email: sql`coalesce(excluded.email, ${chatbotLeads.email})`,
        phone: sql`coalesce(excluded.phone, ${chatbotLeads.phone})`,
        company: sql`coalesce(excluded.company, ${chatbotLeads.company})`,
        updatedAt: new Date(),
      },
    });
}

/** Rates a lead that exists. False for a session that left no details, which is not a lead. Staff connection only. */
export async function applyChatbotQualification(
  db: Runner,
  input: { readonly chatbotId: string; readonly sessionId: string; readonly tier: string; readonly score: number | null },
): Promise<boolean> {
  const rows = await db
    .update(chatbotLeads)
    .set({ tier: input.tier, score: input.score })
    .where(and(eq(chatbotLeads.chatbotId, input.chatbotId), eq(chatbotLeads.sessionId, input.sessionId)))
    .returning({ id: chatbotLeads.id });
  return rows.length > 0;
}
