import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyChatbotQualification,
  ChatbotBotIdTakenError,
  countChatbotLeadsForBusiness,
  eraseChatbotsOfBusiness,
  findChatbotLeadForBusiness,
  findChatbotOperatorAccess,
  findChatbotWebhookTarget,
  listChatbotLeadsForBusiness,
  listChatbotsForBusiness,
  listChatbotsForStaff,
  recordChatbotLead,
  registerChatbot,
  removeChatbot,
  renameChatbot,
  setChatbotOperatorKey,
  setChatbotStatus,
} from "./queries/chatbots";
import { businesses, businessMembers, chatbotLeads, chatbots, chatbotWebhookSecrets, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-10-16T09:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

function asOwner<T>(businessId: string, userId: string, work: Parameters<typeof withTenantScope<T>>[2]): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

const OPERATOR_KEY = "fedcba9876543210fedcba9876543210";

async function bot(businessId: string, oyechatsBotId: number, name = "Website assistant", operatorKey: string | null = null) {
  return registerChatbot(dbs.staff.db, { businessId, name, oyechatsBotId, websiteUrl: "https://cafe.example.com", webhookSecret: SECRET, operatorKey });
}

describe("registerChatbot", () => {
  it("stores the bot setting up, with its webhook secret kept apart", async () => {
    const created = await bot(businessA, 41);

    expect(created).toMatchObject({ businessId: businessA, name: "Website assistant", oyechatsBotId: 41, status: "setting_up" });
    expect(await findChatbotWebhookTarget(dbs.staff.db, 41)).toEqual({ chatbotId: created.id, businessId: businessA, secret: SECRET });
    expect(await findChatbotWebhookTarget(dbs.staff.db, 99)).toBeNull();
  });

  it("refuses an OyeChats bot that another bot already uses, even for another business, and writes nothing", async () => {
    await bot(businessA, 41);

    await expect(bot(businessB, 41)).rejects.toBeInstanceOf(ChatbotBotIdTakenError);

    expect(await listChatbotsForBusiness(dbs.staff.db, businessB)).toEqual([]);
    expect(await dbs.staff.db.select().from(chatbotWebhookSecrets)).toHaveLength(1);
  });

  it("holds the database to its limits: a short secret, a blank name and a non-http address", async () => {
    expect(await captureErrorText(registerChatbot(dbs.staff.db, { businessId: businessA, name: "A", oyechatsBotId: 1, websiteUrl: null, webhookSecret: "short", operatorKey: null }))).toMatch(
      /chatbot_webhook_secrets_secret_check/,
    );
    expect(await captureErrorText(registerChatbot(dbs.staff.db, { businessId: businessA, name: "  ", oyechatsBotId: 2, websiteUrl: null, webhookSecret: SECRET, operatorKey: null }))).toMatch(/chatbots_name_check/);
    expect(
      await captureErrorText(registerChatbot(dbs.staff.db, { businessId: businessA, name: "A", oyechatsBotId: 3, websiteUrl: "javascript:alert(1)", webhookSecret: SECRET, operatorKey: null })),
    ).toMatch(/chatbots_website_url_check/);
    expect(await listChatbotsForBusiness(dbs.staff.db, businessA)).toEqual([]);
  });
});

describe("a customer's view", () => {
  it("sees only their own business's bots and leads, and never a webhook secret", async () => {
    const mine = await bot(businessA, 41);
    const theirs = await bot(businessB, 42, "Riverside bot");
    await recordChatbotLead(dbs.staff.db, { chatbotId: mine.id, businessId: businessA, sessionId: "s1", name: "Meera", email: "meera@example.com", phone: null, company: null, capturedAt: NOW });
    await recordChatbotLead(dbs.staff.db, { chatbotId: theirs.id, businessId: businessB, sessionId: "s2", name: "Other", email: "other@example.com", phone: null, company: null, capturedAt: NOW });

    expect((await asOwner(businessA, OWNER_A, (tx) => listChatbotsForBusiness(tx, businessA))).map((row) => row.name)).toEqual(["Website assistant"]);
    expect((await asOwner(businessA, OWNER_A, (tx) => listChatbotLeadsForBusiness(tx, businessA, 50))).map((row) => row.email)).toEqual(["meera@example.com"]);
    // Naming another business reads nothing: row-level security answers for the signed-in business.
    expect(await asOwner(businessA, OWNER_A, (tx) => listChatbotsForBusiness(tx, businessB))).toEqual([]);
    expect(await asOwner(businessA, OWNER_A, (tx) => listChatbotLeadsForBusiness(tx, businessB, 50))).toEqual([]);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.select().from(chatbotWebhookSecrets)))).toMatch(/permission denied/);
  });

  it("cannot write a bot or a lead", async () => {
    const mine = await bot(businessA, 41);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => setChatbotStatus(tx, { chatbotId: mine.id, businessId: businessA, status: "live" })))).toMatch(/permission denied/);
    expect(
      await captureErrorText(
        asOwner(businessA, OWNER_A, (tx) =>
          recordChatbotLead(tx, { chatbotId: mine.id, businessId: businessA, sessionId: "s1", name: null, email: "x@example.com", phone: null, company: null, capturedAt: NOW }),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});

describe("listChatbotsForStaff", () => {
  it("shows each of the business's bots with how many leads it has", async () => {
    const first = await bot(businessA, 41, "Website assistant");
    await bot(businessA, 42, "Booking helper");
    await bot(businessB, 43, "Not this business");
    for (const sessionId of ["s1", "s2"]) {
      await recordChatbotLead(dbs.staff.db, { chatbotId: first.id, businessId: businessA, sessionId, name: sessionId, email: null, phone: null, company: null, capturedAt: NOW });
    }

    const rows = await listChatbotsForStaff(dbs.staff.db, businessA);

    expect(rows.map((row) => [row.name, row.leadCount])).toEqual([
      ["Website assistant", 2],
      ["Booking helper", 0],
    ]);
    expect(await listChatbotsForStaff(dbs.staff.db, "00000000-0000-7000-8000-000000000000")).toEqual([]);
  });
});

describe("recordChatbotLead", () => {
  it("adds a lead once per chat session and keeps what an earlier delivery already had", async () => {
    const created = await bot(businessA, 41);
    const lead = { chatbotId: created.id, businessId: businessA, sessionId: "s1", capturedAt: NOW };

    await recordChatbotLead(dbs.staff.db, { ...lead, name: "Meera", email: "meera@example.com", phone: null, company: null });
    await recordChatbotLead(dbs.staff.db, { ...lead, name: "Meera Shah", email: null, phone: "+919820011223", company: "Shah Dental" });
    await recordChatbotLead(dbs.staff.db, { ...lead, name: "Meera Shah", email: null, phone: "+919820011223", company: "Shah Dental" });

    const rows = await dbs.staff.db.select().from(chatbotLeads);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: "s1", name: "Meera Shah", email: "meera@example.com", phone: "+919820011223", company: "Shah Dental" });
  });

  it("keeps two sessions as two leads", async () => {
    const created = await bot(businessA, 41);
    for (const sessionId of ["s1", "s2"]) {
      await recordChatbotLead(dbs.staff.db, { chatbotId: created.id, businessId: businessA, sessionId, name: sessionId, email: null, phone: null, company: null, capturedAt: NOW });
    }
    expect(await dbs.staff.db.select().from(chatbotLeads)).toHaveLength(2);
  });

  it("lists the newest first and stops at the limit", async () => {
    const created = await bot(businessA, 41);
    for (const [index, sessionId] of ["s1", "s2", "s3"].entries()) {
      await recordChatbotLead(dbs.staff.db, {
        chatbotId: created.id,
        businessId: businessA,
        sessionId,
        name: sessionId,
        email: null,
        phone: null,
        company: null,
        capturedAt: new Date(NOW.getTime() + index * 60_000),
      });
    }
    expect((await listChatbotLeadsForBusiness(dbs.staff.db, businessA, 2)).map((row) => row.name)).toEqual(["s3", "s2"]);
  });
});

describe("pages of leads", () => {
  it("pages through the business's leads newest first without repeating or dropping one, and counts them all", async () => {
    const mine = await bot(businessA, 41);
    const theirs = await bot(businessB, 42);
    for (let index = 0; index < 23; index += 1) {
      await recordChatbotLead(dbs.staff.db, {
        chatbotId: mine.id,
        businessId: businessA,
        sessionId: `s${index}`,
        name: `Lead ${index}`,
        email: null,
        phone: null,
        company: null,
        // Two leads share each minute, so the order has to fall back on the id.
        capturedAt: new Date(NOW.getTime() + Math.floor(index / 2) * 60_000),
      });
    }
    await recordChatbotLead(dbs.staff.db, { chatbotId: theirs.id, businessId: businessB, sessionId: "other", name: "Not mine", email: null, phone: null, company: null, capturedAt: NOW });

    const pages = await asOwner(businessA, OWNER_A, async (tx) => [
      await listChatbotLeadsForBusiness(tx, businessA, 10, 0),
      await listChatbotLeadsForBusiness(tx, businessA, 10, 10),
      await listChatbotLeadsForBusiness(tx, businessA, 10, 20),
      await listChatbotLeadsForBusiness(tx, businessA, 10, 30),
    ]);
    const names = pages.flat().map((row) => row.name);

    expect(pages.map((page) => page.length)).toEqual([10, 10, 3, 0]);
    expect(new Set(names).size).toBe(23);
    expect(names).not.toContain("Not mine");
    // Newest minute first: the last two leads written (22 and 21) come before the first two (1 and 0).
    expect(names.slice(0, 2).sort()).toEqual(["Lead 21", "Lead 22"]);
    expect(names.slice(-2).sort()).toEqual(["Lead 0", "Lead 1"]);
    expect(await asOwner(businessA, OWNER_A, (tx) => countChatbotLeadsForBusiness(tx, businessA))).toBe(23);
    expect(await asOwner(businessA, OWNER_A, (tx) => countChatbotLeadsForBusiness(tx, businessB))).toBe(0);
    expect(await countChatbotLeadsForBusiness(dbs.staff.db, "not-a-uuid")).toBe(0);
  });
});

describe("applyChatbotQualification", () => {
  it("rates a lead that exists, and does nothing for a session that left no details", async () => {
    const created = await bot(businessA, 41);
    await recordChatbotLead(dbs.staff.db, { chatbotId: created.id, businessId: businessA, sessionId: "s1", name: "Meera", email: null, phone: null, company: null, capturedAt: NOW });

    expect(await applyChatbotQualification(dbs.staff.db, { chatbotId: created.id, sessionId: "s1", tier: "sql", score: 82 })).toBe(true);
    expect(await applyChatbotQualification(dbs.staff.db, { chatbotId: created.id, sessionId: "nobody", tier: "sql", score: 82 })).toBe(false);

    expect((await dbs.staff.db.select().from(chatbotLeads).where(eq(chatbotLeads.sessionId, "s1")))[0]).toMatchObject({ tier: "sql", score: 82 });
    expect(await dbs.staff.db.select().from(chatbotLeads)).toHaveLength(1);
  });

  it("refuses a score outside 0 to 100", async () => {
    const created = await bot(businessA, 41);
    await recordChatbotLead(dbs.staff.db, { chatbotId: created.id, businessId: businessA, sessionId: "s1", name: null, email: null, phone: null, company: null, capturedAt: NOW });
    expect(await captureErrorText(applyChatbotQualification(dbs.staff.db, { chatbotId: created.id, sessionId: "s1", tier: "sql", score: 500 }))).toMatch(/chatbot_leads_score_check/);
  });
});

describe("renameChatbot", () => {
  it("lets a customer rename their own bot, and only theirs", async () => {
    const mine = await bot(businessA, 41);
    const theirs = await bot(businessB, 42, "Riverside bot");

    expect(await asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: mine.id, businessId: businessA, name: "Booking helper" }))).toBe(true);
    expect((await listChatbotsForBusiness(dbs.staff.db, businessA))[0]?.name).toBe("Booking helper");

    // Another business's bot: naming it matches nothing, whichever business is named, and its name is untouched.
    expect(await asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: theirs.id, businessId: businessA, name: "Mine now" }))).toBe(false);
    expect(await asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: theirs.id, businessId: businessB, name: "Mine now" }))).toBe(false);
    expect((await listChatbotsForBusiness(dbs.staff.db, businessB))[0]?.name).toBe("Riverside bot");
    expect(await asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: "not-a-uuid", businessId: businessA, name: "x" }))).toBe(false);
  });

  it("holds the database to its name limit", async () => {
    const mine = await bot(businessA, 41);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: mine.id, businessId: businessA, name: "   " })))).toMatch(/chatbots_name_check/);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => renameChatbot(tx, { chatbotId: mine.id, businessId: businessA, name: "x".repeat(81) })))).toMatch(/chatbots_name_check/);
  });

  it("gives the customer the name and nothing else: not the status, the bot number or the website", async () => {
    const mine = await bot(businessA, 41);
    const attempts = [{ status: "live" as const }, { oyechatsBotId: 99 }, { websiteUrl: "https://elsewhere.example.com" }, { businessId: businessB }];
    for (const change of attempts) {
      const error = await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.update(chatbots).set(change).where(eq(chatbots.id, mine.id))));
      expect(error).toMatch(/permission denied/);
    }
    expect(await listChatbotsForBusiness(dbs.staff.db, businessA)).toMatchObject([{ status: "setting_up", oyechatsBotId: 41, websiteUrl: "https://cafe.example.com", businessId: businessA }]);
  });
});

describe("setChatbotStatus and removeChatbot", () => {
  it("changes the status of the business's own bot only", async () => {
    const created = await bot(businessA, 41);

    expect(await setChatbotStatus(dbs.staff.db, { chatbotId: created.id, businessId: businessB, status: "live" })).toBe(false);
    expect(await setChatbotStatus(dbs.staff.db, { chatbotId: created.id, businessId: businessA, status: "live" })).toBe(true);
    expect((await listChatbotsForBusiness(dbs.staff.db, businessA))[0]?.status).toBe("live");
    expect(await setChatbotStatus(dbs.staff.db, { chatbotId: "not-a-uuid", businessId: businessA, status: "live" })).toBe(false);
  });

  it("removes a bot with its secret and its leads, and only for its own business", async () => {
    const created = await bot(businessA, 41);
    await recordChatbotLead(dbs.staff.db, { chatbotId: created.id, businessId: businessA, sessionId: "s1", name: "Meera", email: null, phone: null, company: null, capturedAt: NOW });

    expect(await removeChatbot(dbs.staff.db, { chatbotId: created.id, businessId: businessB })).toBe(false);
    expect(await listChatbotsForBusiness(dbs.staff.db, businessA)).toHaveLength(1);

    expect(await removeChatbot(dbs.staff.db, { chatbotId: created.id, businessId: businessA })).toBe(true);
    expect(await listChatbotsForBusiness(dbs.staff.db, businessA)).toEqual([]);
    expect(await dbs.staff.db.select().from(chatbotLeads)).toEqual([]);
    expect(await dbs.staff.db.select().from(chatbotWebhookSecrets)).toEqual([]);
    expect(await findChatbotWebhookTarget(dbs.staff.db, 41)).toBeNull();
  });
});

describe("a bot's operator key", () => {
  it("is kept with the bot, found by staff alone, and null when none was given", async () => {
    const keyed = await bot(businessA, 41, "Website assistant", OPERATOR_KEY);
    const unkeyed = await bot(businessA, 42, "Booking helper");

    expect(await findChatbotOperatorAccess(dbs.staff.db, keyed.id)).toEqual({ oyechatsBotId: 41, operatorKey: OPERATOR_KEY });
    expect(await findChatbotOperatorAccess(dbs.staff.db, unkeyed.id)).toBeNull();
    expect(await findChatbotOperatorAccess(dbs.staff.db, "not-a-uuid")).toBeNull();
    expect((await listChatbotsForStaff(dbs.staff.db, businessA)).map((row) => [row.name, row.hasOperatorKey])).toEqual([
      ["Website assistant", true],
      ["Booking helper", false],
    ]);
    // The customer's connection has no grant on the table that holds it.
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => findChatbotOperatorAccess(tx, keyed.id)))).toMatch(/permission denied/);
  });

  it("is set, replaced and cleared for the business's own bot only", async () => {
    const created = await bot(businessA, 41);

    expect(await setChatbotOperatorKey(dbs.staff.db, { chatbotId: created.id, businessId: businessB, operatorKey: OPERATOR_KEY })).toBe(false);
    expect(await findChatbotOperatorAccess(dbs.staff.db, created.id)).toBeNull();

    expect(await setChatbotOperatorKey(dbs.staff.db, { chatbotId: created.id, businessId: businessA, operatorKey: OPERATOR_KEY })).toBe(true);
    expect((await findChatbotOperatorAccess(dbs.staff.db, created.id))?.operatorKey).toBe(OPERATOR_KEY);

    expect(await setChatbotOperatorKey(dbs.staff.db, { chatbotId: created.id, businessId: businessA, operatorKey: null })).toBe(true);
    expect(await findChatbotOperatorAccess(dbs.staff.db, created.id)).toBeNull();
    expect(await setChatbotOperatorKey(dbs.staff.db, { chatbotId: "nope", businessId: businessA, operatorKey: OPERATOR_KEY })).toBe(false);
  });

  it("holds the database to its limit: a key too short to be real is refused", async () => {
    const created = await bot(businessA, 41);
    expect(await captureErrorText(setChatbotOperatorKey(dbs.staff.db, { chatbotId: created.id, businessId: businessA, operatorKey: "short" }))).toMatch(
      /chatbot_webhook_secrets_operator_key_check/,
    );
  });

  it("goes with the bot when it is removed", async () => {
    const created = await bot(businessA, 41, "Website assistant", OPERATOR_KEY);
    await removeChatbot(dbs.staff.db, { chatbotId: created.id, businessId: businessA });
    expect(await findChatbotOperatorAccess(dbs.staff.db, created.id)).toBeNull();
  });
});

describe("findChatbotLeadForBusiness", () => {
  it("finds a lead of the signed-in business with its bot's OyeChats number, and no one else's", async () => {
    const mine = await bot(businessA, 41);
    const theirs = await bot(businessB, 42);
    await recordChatbotLead(dbs.staff.db, { chatbotId: mine.id, businessId: businessA, sessionId: "s1", name: "Meera", email: null, phone: null, company: null, capturedAt: NOW });
    await recordChatbotLead(dbs.staff.db, { chatbotId: theirs.id, businessId: businessB, sessionId: "s2", name: "Other", email: null, phone: null, company: null, capturedAt: NOW });
    const [myLead] = await listChatbotLeadsForBusiness(dbs.staff.db, businessA, 5);
    const [theirLead] = await listChatbotLeadsForBusiness(dbs.staff.db, businessB, 5);

    const found = await asOwner(businessA, OWNER_A, (tx) => findChatbotLeadForBusiness(tx, businessA, myLead?.id ?? ""));
    expect(found).toMatchObject({ oyechatsBotId: 41, lead: { sessionId: "s1", name: "Meera" } });
    // Another business's lead id, and one that is not a lead at all, find nothing.
    expect(await asOwner(businessA, OWNER_A, (tx) => findChatbotLeadForBusiness(tx, businessA, theirLead?.id ?? ""))).toBeNull();
    expect(await asOwner(businessA, OWNER_A, (tx) => findChatbotLeadForBusiness(tx, businessB, theirLead?.id ?? ""))).toBeNull();
    expect(await asOwner(businessA, OWNER_A, (tx) => findChatbotLeadForBusiness(tx, businessA, "not-a-uuid"))).toBeNull();
  });
});

describe("eraseChatbotsOfBusiness", () => {
  it("removes the business's bots, secrets and leads, and leaves another business's alone", async () => {
    const mine = await bot(businessA, 41);
    const theirs = await bot(businessB, 42);
    await recordChatbotLead(dbs.staff.db, { chatbotId: mine.id, businessId: businessA, sessionId: "s1", name: "Meera", email: "meera@example.com", phone: null, company: null, capturedAt: NOW });
    await recordChatbotLead(dbs.staff.db, { chatbotId: theirs.id, businessId: businessB, sessionId: "s2", name: "Other", email: null, phone: null, company: null, capturedAt: NOW });

    await eraseChatbotsOfBusiness(dbs.staff.db, businessA);

    expect(await listChatbotsForBusiness(dbs.staff.db, businessA)).toEqual([]);
    expect(await findChatbotWebhookTarget(dbs.staff.db, 41)).toBeNull();
    expect(await listChatbotLeadsForBusiness(dbs.staff.db, businessA, 50)).toEqual([]);
    expect(await listChatbotsForBusiness(dbs.staff.db, businessB)).toHaveLength(1);
    expect(await listChatbotLeadsForBusiness(dbs.staff.db, businessB, 50)).toHaveLength(1);
  });
});
