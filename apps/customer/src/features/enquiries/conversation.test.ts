import { consumeRateLimit, findChatbotLeadForBusiness, findChatbotOperatorAccess, findEnquiry, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb, getStaffDb } from "@/lib/db";
import { loadEnquiryConversation } from "./conversation";
import { fetchConversation } from "./oyechats-api";

vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./oyechats-api", () => ({ fetchConversation: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  consumeRateLimit: vi.fn(),
  findChatbotLeadForBusiness: vi.fn(),
  findChatbotOperatorAccess: vi.fn(),
  findEnquiry: vi.fn(),
  withTenantScope: vi.fn(),
}));

const appDb = { name: "app-db" } as never;
const staffDb = { name: "staff-db" } as never;
const appTx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;
const customer = { tenant, businessId: "business-1" };
const ACCESS = { oyechatsBotId: 41, operatorKey: "fedcba9876543210fedcba9876543210" } as const;
const LEAD_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ENQUIRY = { id: "e1", kind: "chat", sourceRef: `chatbot_lead:${LEAD_ID}` } as never;
const LEAD = { lead: { id: LEAD_ID, chatbotId: "bot-1", sessionId: "session-9", tier: "sql" }, oyechatsBotId: 41 } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
});

describe("loadEnquiryConversation", () => {
  it("finds the enquiry and its lead as the signed-in business, then asks OyeChats for the session stored on the lead", async () => {
    const messages = [{ author: "visitor", text: "Hello", at: null }] as const;
    vi.mocked(findEnquiry).mockResolvedValue(ENQUIRY);
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(ACCESS);
    vi.mocked(fetchConversation).mockResolvedValue({ status: "ok", messages });

    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "ok", messages, warmth: "Hot" });

    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(findEnquiry).toHaveBeenCalledWith(appTx, "e1");
    expect(findChatbotLeadForBusiness).toHaveBeenCalledWith(appTx, "business-1", LEAD_ID);
    expect(findChatbotOperatorAccess).toHaveBeenCalledWith(staffDb, "bot-1");
    expect(fetchConversation).toHaveBeenCalledWith(ACCESS, "session-9");
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, "oyechats-conversation:business:business-1", { limit: 60, windowSeconds: 60 });
  });

  it("says not-found, and reads no key at all, for an enquiry that is not this business's", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(null);
    expect(await loadEnquiryConversation(customer, "someone-elses")).toEqual({ status: "not-found" });
    expect(findChatbotLeadForBusiness).not.toHaveBeenCalled();
    expect(findChatbotOperatorAccess).not.toHaveBeenCalled();
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("says not-found for an enquiry that is not a chat, or whose lead is not this business's", async () => {
    vi.mocked(findEnquiry).mockResolvedValue({ id: "e2", kind: "form", sourceRef: "site_event:1" } as never);
    expect(await loadEnquiryConversation(customer, "e2")).toEqual({ status: "not-found" });

    vi.mocked(findEnquiry).mockResolvedValue(ENQUIRY);
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(null);
    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "not-found" });
    expect(findChatbotOperatorAccess).not.toHaveBeenCalled();
  });

  it("says limited, and calls OyeChats no more, once the business has opened too many", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(ENQUIRY);
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 20 });
    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "limited" });
    expect(findChatbotOperatorAccess).not.toHaveBeenCalled();
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("says unavailable when the bot has no operator key yet", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(ENQUIRY);
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(null);
    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "unavailable" });
    expect(fetchConversation).not.toHaveBeenCalled();
  });

  it("passes on OyeChats' own not-found and unavailable answers", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(ENQUIRY);
    vi.mocked(findChatbotLeadForBusiness).mockResolvedValue(LEAD);
    vi.mocked(findChatbotOperatorAccess).mockResolvedValue(ACCESS);
    vi.mocked(fetchConversation).mockResolvedValueOnce({ status: "not-found" });
    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "not-found" });
    vi.mocked(fetchConversation).mockResolvedValueOnce({ status: "unavailable" });
    expect(await loadEnquiryConversation(customer, "e1")).toEqual({ status: "unavailable" });
  });
});
