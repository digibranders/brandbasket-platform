import { consumeRateLimit, findChatbotLeadForBusiness, findChatbotOperatorAccess, withTenantScope } from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBotActivity, loadLeadConversation } from "./chatbot-conversations";
import { getAppDb, getStaffDb } from "./db";
import { fetchConversation, fetchLeadActivity } from "./oyechats-api";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./oyechats-api", () => ({ fetchConversation: vi.fn(), fetchLeadActivity: vi.fn() }));
vi.mock("@fynix/db", () => ({
  consumeRateLimit: vi.fn(),
  findChatbotLeadForBusiness: vi.fn(),
  findChatbotOperatorAccess: vi.fn(),
  withTenantScope: vi.fn(),
}));

const appDb = { name: "app-db" } as never;
const staffDb = { name: "staff-db" } as never;
const appTx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const ACCESS = { oyechatsBotId: 41, operatorKey: "fedcba9876543210fedcba9876543210" } as const;
const LEAD = { lead: { id: "lead-1", chatbotId: "bot-1", sessionId: "session-9" }, oyechatsBotId: 41 } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
});

describe("loadBotActivity", () => {
  it("reads each bot's activity with that bot's own key, and gives null for a bot without a key", async () => {
    const activity = new Map([["session-9", { messages: 4, lastActiveAt: null }]]);
    vi.mocked(findChatbotOperatorAccess).mockImplementation(async (_db, id) => (id === "bot-1" ? ACCESS : null));
    vi.mocked(fetchLeadActivity).mockResolvedValue(activity);

    const result = await loadBotActivity([{ id: "bot-1" }, { id: "bot-2" }]);

    expect(result.get("bot-1")).toBe(activity);
    expect(result.get("bot-2")).toBeNull();
    expect(findChatbotOperatorAccess).toHaveBeenCalledWith(staffDb, "bot-1");
    expect(fetchLeadActivity).toHaveBeenCalledTimes(1);
    expect(fetchLeadActivity).toHaveBeenCalledWith(ACCESS);
  });

  it("gives null for a bot whose conversations OyeChats will not give", async () => {
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(ACCESS);
    vi.mocked(fetchLeadActivity).mockResolvedValue(null);
    expect((await loadBotActivity([{ id: "bot-1" }])).get("bot-1")).toBeNull();
  });
});

describe("loadLeadConversation", () => {
  it("finds the lead as the signed-in business, then asks OyeChats for the session stored on it", async () => {
    const messages = [{ author: "visitor", text: "Hello", at: null }] as const;
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(ACCESS);
    vi.mocked(fetchConversation).mockResolvedValue({ status: "ok", messages });

    expect(await loadLeadConversation({ tenant }, "lead-1")).toEqual({ status: "ok", messages });

    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(findChatbotLeadForBusiness).toHaveBeenCalledWith(appTx, "business-1", "lead-1");
    expect(findChatbotOperatorAccess).toHaveBeenCalledWith(staffDb, "bot-1");
    expect(fetchConversation).toHaveBeenCalledWith(ACCESS, "session-9");
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, "oyechats-conversation:business:business-1", { limit: 60, windowSeconds: 60 });
  });

  it("says not-found, and reads no key at all, for a lead that is not this business's", async () => {
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(null);

    expect(await loadLeadConversation({ tenant }, "someone-elses")).toEqual({ status: "not-found" });

    expect(findChatbotOperatorAccess).not.toHaveBeenCalled();
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("says limited, and calls OyeChats no more, once the business has opened too many", async () => {
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 20 });

    expect(await loadLeadConversation({ tenant }, "lead-1")).toEqual({ status: "limited" });

    expect(findChatbotOperatorAccess).not.toHaveBeenCalled();
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("says unavailable when the bot has no operator key yet", async () => {
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(null);

    expect(await loadLeadConversation({ tenant }, "lead-1")).toEqual({ status: "unavailable" });
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("passes on OyeChats' own not-found and unavailable answers", async () => {
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(ACCESS);

    vi.mocked(fetchConversation).mockResolvedValueOnce({ status: "not-found" });
    expect(await loadLeadConversation({ tenant }, "lead-1")).toEqual({ status: "not-found" });

    vi.mocked(fetchConversation).mockResolvedValueOnce({ status: "unavailable" });
    expect(await loadLeadConversation({ tenant }, "lead-1")).toEqual({ status: "unavailable" });
  });
});
