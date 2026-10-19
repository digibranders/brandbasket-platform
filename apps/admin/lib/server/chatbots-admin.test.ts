import { ChatbotBotIdTakenError, listChatbotsForStaff, registerChatbot, removeChatbot, setChatbotOperatorKey, setChatbotStatus } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addClientChatbot, loadClientChatbots, removeClientChatbot, setClientChatbotOperatorKey, setClientChatbotStatus } from "./chatbots-admin";
import { getStaffDb } from "./db";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class MockChatbotBotIdTakenError extends Error {}
  return {
    ChatbotBotIdTakenError: MockChatbotBotIdTakenError,
    listChatbotsForStaff: vi.fn(),
    registerChatbot: vi.fn(),
    removeChatbot: vi.fn(),
    setChatbotOperatorKey: vi.fn(),
    setChatbotStatus: vi.fn(),
  };
});

const staffDb = { name: "staff-db" } as never;
const VALUES = { name: "Website assistant", oyechatsBotId: 41, websiteUrl: null, webhookSecret: "0123456789abcdef0123456789abcdef", operatorKey: "fedcba9876543210fedcba9876543210" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
});

describe("the console's chatbot work", () => {
  it("lists the business's bots with their lead counts, naming the business", async () => {
    vi.mocked(listChatbotsForStaff).mockResolvedValue([{ id: "bot-1", leadCount: 3 }] as never);
    expect(await loadClientChatbots("business-1")).toEqual([{ id: "bot-1", leadCount: 3 }]);
    expect(listChatbotsForStaff).toHaveBeenCalledWith(staffDb, "business-1");
  });

  it("registers a bot for the business it was asked for", async () => {
    expect(await addClientChatbot("business-1", VALUES)).toBe("added");
    expect(registerChatbot).toHaveBeenCalledWith(staffDb, { businessId: "business-1", ...VALUES });
  });

  it("says so when the OyeChats bot number is already used, and rethrows anything else", async () => {
    vi.mocked(registerChatbot).mockRejectedValueOnce(new ChatbotBotIdTakenError(41));
    expect(await addClientChatbot("business-1", VALUES)).toBe("bot-id-taken");
    vi.mocked(registerChatbot).mockRejectedValueOnce(new Error("connection lost"));
    await expect(addClientChatbot("business-1", VALUES)).rejects.toThrow("connection lost");
  });

  it("saves and removes a bot's operator key only through the business that owns it", async () => {
    vi.mocked(setChatbotOperatorKey).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await setClientChatbotOperatorKey("business-1", "bot-1", "fedcba9876543210fedcba9876543210")).toBe(true);
    expect(setChatbotOperatorKey).toHaveBeenLastCalledWith(staffDb, { chatbotId: "bot-1", businessId: "business-1", operatorKey: "fedcba9876543210fedcba9876543210" });
    expect(await setClientChatbotOperatorKey("business-1", "bot-2", null)).toBe(false);
    expect(setChatbotOperatorKey).toHaveBeenLastCalledWith(staffDb, { chatbotId: "bot-2", businessId: "business-1", operatorKey: null });
  });

  it("changes a status and removes a bot only through the business that owns it", async () => {
    vi.mocked(setChatbotStatus).mockResolvedValue(true);
    vi.mocked(removeChatbot).mockResolvedValue(false);

    expect(await setClientChatbotStatus("business-1", "bot-1", "live")).toBe(true);
    expect(setChatbotStatus).toHaveBeenCalledWith(staffDb, { chatbotId: "bot-1", businessId: "business-1", status: "live" });
    expect(await removeClientChatbot("business-1", "bot-1")).toBe(false);
    expect(removeChatbot).toHaveBeenCalledWith(staffDb, { chatbotId: "bot-1", businessId: "business-1" });
  });
});
