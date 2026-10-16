import { applyChatbotQualification, findChatbotWebhookTarget, recordChatbotLead } from "@fynix/db";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { handleOyeChatsWebhook } from "./oyechats-webhook";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@fynix/db", () => ({
  applyChatbotQualification: vi.fn(),
  findChatbotWebhookTarget: vi.fn(),
  recordChatbotLead: vi.fn(),
}));

const SECRET = "0123456789abcdef0123456789abcdef";
const staffDb = { name: "staff-db" } as never;
const TARGET = { chatbotId: "chatbot-1", businessId: "business-1", secret: SECRET };

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}
function lead(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "lead_captured",
    bot_id: 41,
    timestamp: "2026-10-16T09:00:00+00:00",
    data: { session_id: "sess-1", name: "Meera", email: "meera@example.com", phone: null, company: null, ...overrides },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(findChatbotWebhookTarget).mockResolvedValue(TARGET);
  vi.mocked(applyChatbotQualification).mockResolvedValue(true);
});

describe("handleOyeChatsWebhook", () => {
  it("records a signed lead for the business that owns the bot, taking the business from our own record", async () => {
    const body = lead();

    expect(await handleOyeChatsWebhook(body, sign(body))).toEqual({ kind: "recorded" });

    expect(findChatbotWebhookTarget).toHaveBeenCalledWith(staffDb, 41);
    expect(recordChatbotLead).toHaveBeenCalledWith(staffDb, {
      chatbotId: "chatbot-1",
      businessId: "business-1",
      sessionId: "sess-1",
      name: "Meera",
      email: "meera@example.com",
      phone: null,
      company: null,
      capturedAt: new Date("2026-10-16T09:00:00.000Z"),
    });
  });

  it("rates a lead from a qualification event", async () => {
    const body = JSON.stringify({ event: "tier_transition", bot_id: 41, timestamp: "2026-10-16T10:00:00+00:00", data: { session_id: "sess-1", new_tier: "sql", score: 80 } });

    expect(await handleOyeChatsWebhook(body, sign(body))).toEqual({ kind: "recorded" });

    expect(applyChatbotQualification).toHaveBeenCalledWith(staffDb, { chatbotId: "chatbot-1", sessionId: "sess-1", tier: "sql", score: 80 });
    expect(recordChatbotLead).not.toHaveBeenCalled();
  });

  it("refuses a body signed with another secret, writing nothing", async () => {
    const body = lead();
    expect(await handleOyeChatsWebhook(body, sign(body, "another-secret-another-secret-00"))).toEqual({ kind: "refused" });
    expect(recordChatbotLead).not.toHaveBeenCalled();
  });

  it("refuses a missing signature, and an altered body", async () => {
    const body = lead();
    expect(await handleOyeChatsWebhook(body, null)).toEqual({ kind: "refused" });
    expect(await handleOyeChatsWebhook(lead({ email: "attacker@example.com" }), sign(body))).toEqual({ kind: "refused" });
    expect(recordChatbotLead).not.toHaveBeenCalled();
  });

  it("refuses a bot it does not know the same way as a bad signature, so the answer does not say which bots exist", async () => {
    vi.mocked(findChatbotWebhookTarget).mockResolvedValue(null);
    const body = lead();
    expect(await handleOyeChatsWebhook(body, sign(body))).toEqual({ kind: "refused" });
    expect(recordChatbotLead).not.toHaveBeenCalled();
  });

  it("refuses a body that names no bot, without looking anything up", async () => {
    expect(await handleOyeChatsWebhook("not json", sign("not json"))).toEqual({ kind: "refused" });
    expect(findChatbotWebhookTarget).not.toHaveBeenCalled();
  });

  it("acknowledges a signed event it does not use, so OyeChats does not retry it", async () => {
    const body = JSON.stringify({ event: "chat_closed", bot_id: 41, timestamp: "2026-10-16T09:00:00+00:00", data: { session_id: "sess-1" } });
    expect(await handleOyeChatsWebhook(body, sign(body))).toEqual({ kind: "ignored" });
    expect(recordChatbotLead).not.toHaveBeenCalled();
    expect(applyChatbotQualification).not.toHaveBeenCalled();
  });

  it("acknowledges a rating for a session that left no details, which is not a lead", async () => {
    vi.mocked(applyChatbotQualification).mockResolvedValue(false);
    const body = JSON.stringify({ event: "tier_transition", bot_id: 41, timestamp: "2026-10-16T10:00:00+00:00", data: { session_id: "ghost", new_tier: "mql", score: 20 } });
    expect(await handleOyeChatsWebhook(body, sign(body))).toEqual({ kind: "ignored" });
  });
});
