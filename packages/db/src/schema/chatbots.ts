import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * The chatbots OyeChats runs for a business. A bot has no account of its own here or for the customer: Brandbasket staff set it
 * up and look after it in OyeChats, and the dashboard is the customer's window onto it (its status, and the leads it
 * collects). Staff register a bot on the client's page in the console; OyeChats then reports each captured lead to
 * POST /api/webhooks/oyechats, signed with the secret OyeChats made for that bot's webhook.
 */

export const chatbotStatus = pgEnum("chatbot_status", ["setting_up", "live", "paused"]);
export type ChatbotStatus = (typeof chatbotStatus.enumValues)[number];

export const chatbots = pgTable(
  "chatbots",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    /** What the customer calls it: "Website assistant". */
    name: text("name").notNull(),
    /** OyeChats' own number for the bot, which every webhook it sends names. Unique across all businesses. */
    oyechatsBotId: integer("oyechats_bot_id").notNull(),
    /** The site the bot is embedded on, shown to the customer. Null until known. */
    websiteUrl: text("website_url"),
    status: chatbotStatus("status").notNull().default("setting_up"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("chatbots_oyechats_bot_id_idx").on(table.oyechatsBotId),
    index("chatbots_business_idx").on(table.businessId, table.createdAt),
    check("chatbots_name_check", sql`length(btrim(${table.name})) between 1 and 80`),
    check("chatbots_oyechats_bot_id_check", sql`${table.oyechatsBotId} > 0`),
    check("chatbots_website_url_check", sql`${table.websiteUrl} is null or ${table.websiteUrl} ~ '^https?://[^[:space:]]{1,255}$'`),
  ],
);

/**
 * The credentials Brandbasket holds for one bot, staff only: no customer role can read or write this table, so nothing in it ever
 * reaches the browser. `secret` is what OyeChats signs the bot's webhook deliveries with. `operatorKey` is the key of an
 * OyeChats operator bound to that one bot, which the dashboard server uses to read the bot's own conversations when the
 * customer opens a lead (OyeChats scopes such a key to its single bot). Null until staff add it.
 */
export const chatbotWebhookSecrets = pgTable(
  "chatbot_webhook_secrets",
  {
    chatbotId: uuid("chatbot_id").primaryKey().references(() => chatbots.id),
    secret: text("secret").notNull(),
    operatorKey: text("operator_key"),
    createdAt: createdAt(),
  },
  (table) => [
    check("chatbot_webhook_secrets_secret_check", sql`length(${table.secret}) between 16 and 200`),
    check(
      "chatbot_webhook_secrets_operator_key_check",
      sql`${table.operatorKey} is null or length(${table.operatorKey}) between 16 and 200`,
    ),
  ],
);

/**
 * A visitor who left their details in a bot. One row per OyeChats chat session: a redelivered event, or the later
 * qualification update for the same session, changes the row instead of adding another. `businessId` repeats the bot's
 * business so row-level security can read it without a join.
 */
export const chatbotLeads = pgTable(
  "chatbot_leads",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    chatbotId: uuid("chatbot_id").notNull().references(() => chatbots.id),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    /** OyeChats' chat session id, which makes a delivery idempotent. */
    sessionId: text("session_id").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    /** How warm OyeChats rates the lead ("mql", "sal", "sql"), set by a later qualification event. */
    tier: text("tier"),
    score: integer("score"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("chatbot_leads_session_idx").on(table.chatbotId, table.sessionId),
    index("chatbot_leads_business_idx").on(table.businessId, table.capturedAt),
    check("chatbot_leads_session_check", sql`length(${table.sessionId}) between 1 and 200`),
    check("chatbot_leads_score_check", sql`${table.score} is null or ${table.score} between 0 and 100`),
  ],
);

export type Chatbot = typeof chatbots.$inferSelect;
export type ChatbotLead = typeof chatbotLeads.$inferSelect;
