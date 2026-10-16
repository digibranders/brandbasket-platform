import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchConversation,
  fetchLeadActivity,
  oyechatsApiOrigin,
  parseConversation,
  parseLeadListPage,
  resetOyeChatsCache,
} from "./oyechats-api";

vi.mock("server-only", () => ({}));

const ACCESS = { oyechatsBotId: 41, operatorKey: "fedcba9876543210fedcba9876543210" } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetOyeChatsCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OYECHATS_API_URL", "http://oyechats.test:8000/");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("oyechatsApiOrigin", () => {
  it("reduces the address to its origin and refuses anything that is not http(s)", () => {
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: "https://api.oyechats.example/v1/" })).toBe("https://api.oyechats.example");
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: " http://localhost:8000 " })).toBe("http://localhost:8000");
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: "ftp://x.example" })).toBeNull();
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: "javascript:alert(1)" })).toBeNull();
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: "not a url" })).toBeNull();
    expect(oyechatsApiOrigin({ OYECHATS_API_URL: "" })).toBeNull();
    expect(oyechatsApiOrigin({})).toBeNull();
  });
});

describe("parseLeadListPage", () => {
  it("keeps the sessions with their message counts and last activity, and skips malformed rows", () => {
    const page = parseLeadListPage({
      leads: [
        { session_id: "s1", chats: 6, last_active_at: "2026-10-16T09:30:00+00:00", contact: { name: "Meera" } },
        { session_id: "s2", chats: 0, last_active_at: null },
        { session_id: "s3", chats: "many" },
        { chats: 4 },
        "junk",
      ],
    });

    expect(page?.count).toBe(5);
    expect([...(page?.rows ?? [])]).toEqual([
      ["s1", { messages: 6, lastActiveAt: new Date("2026-10-16T09:30:00Z") }],
      ["s2", { messages: 0, lastActiveAt: null }],
    ]);
  });

  it("reads a time without a zone as UTC", () => {
    const page = parseLeadListPage({ leads: [{ session_id: "s1", chats: 1, last_active_at: "2026-10-16T09:30:00" }] });
    expect(page?.rows.get("s1")?.lastActiveAt).toEqual(new Date("2026-10-16T09:30:00Z"));
  });

  it("refuses a body that is not a lead list", () => {
    expect(parseLeadListPage({ detail: "nope" })).toBeNull();
    expect(parseLeadListPage(null)).toBeNull();
  });
});

describe("parseConversation", () => {
  it("names who spoke, keeps the order, and drops system lines and unknown roles", () => {
    const messages = parseConversation({
      messages: [
        { role: "user", content: "Do you open on Sundays?", timestamp: "2026-10-16T09:00:00+00:00" },
        { role: "bot", content: "Yes, from 9 to 1.", timestamp: "2026-10-16T09:00:05+00:00" },
        { role: "system", content: "internal note", timestamp: null },
        { role: "operator", content: "Priya here, happy to help.", timestamp: null },
        { role: "wizard", content: "?", timestamp: null },
        { role: "user" },
      ],
    });

    expect(messages).toEqual([
      { author: "visitor", text: "Do you open on Sundays?", at: new Date("2026-10-16T09:00:00Z") },
      { author: "assistant", text: "Yes, from 9 to 1.", at: new Date("2026-10-16T09:00:05Z") },
      { author: "team", text: "Priya here, happy to help.", at: null },
    ]);
  });

  it("cuts a very long message and keeps markup as plain text", () => {
    const messages = parseConversation({ messages: [{ role: "user", content: `<img src=x onerror=alert(1)>${"a".repeat(5_000)}` }] });
    expect(messages?.[0]?.text).toHaveLength(4_000);
    expect(messages?.[0]?.text.startsWith("<img src=x")).toBe(true);
  });

  it("refuses a body without messages", () => {
    expect(parseConversation({})).toBeNull();
  });
});

describe("fetchLeadActivity", () => {
  it("asks OyeChats for the bot's leads with the bot's own operator key and returns them by session", async () => {
    fetchMock.mockResolvedValueOnce(json({ leads: [{ session_id: "s1", chats: 3, last_active_at: "2026-10-16T09:30:00+00:00" }] }));

    const rows = await fetchLeadActivity(ACCESS, 1_000);

    expect(rows?.get("s1")).toEqual({ messages: 3, lastActiveAt: new Date("2026-10-16T09:30:00Z") });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://oyechats.test:8000/leads?bot_id=41&page=1&limit=200");
    expect(init?.headers).toMatchObject({ "X-Operator-Key": ACCESS.operatorKey });
    expect(init?.redirect).toBe("error");
  });

  it("keeps the answer for a minute so a busy page does not ask OyeChats again", async () => {
    fetchMock.mockImplementation(async () => json({ leads: [{ session_id: "s1", chats: 3 }] }));

    await fetchLeadActivity(ACCESS, 1_000);
    await fetchLeadActivity(ACCESS, 30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchLeadActivity(ACCESS, 61_001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads further pages while OyeChats returns full ones", async () => {
    const full = Array.from({ length: 200 }, (_, index) => ({ session_id: `a${index}`, chats: 1 }));
    fetchMock.mockResolvedValueOnce(json({ leads: full })).mockResolvedValueOnce(json({ leads: [{ session_id: "last", chats: 9 }] }));

    const rows = await fetchLeadActivity(ACCESS, 1_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page=2");
    expect(rows?.size).toBe(201);
    expect(rows?.get("last")?.messages).toBe(9);
  });

  it("answers null when OyeChats refuses, fails or sends nonsense, and does not ask again for fifteen seconds", async () => {
    fetchMock.mockResolvedValue(json({ detail: "Bot not found or access denied." }, 403));

    expect(await fetchLeadActivity(ACCESS, 1_000)).toBeNull();
    expect(await fetchLeadActivity(ACCESS, 10_000)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(json({ leads: [{ session_id: "s1", chats: 2 }] }));
    expect((await fetchLeadActivity(ACCESS, 16_001))?.get("s1")?.messages).toBe(2);
  });

  it("answers null when the request cannot be made at all", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchLeadActivity(ACCESS, 1_000)).toBeNull();
  });

  it("answers null without calling out when no OyeChats address is configured", async () => {
    vi.stubEnv("OYECHATS_API_URL", "");
    expect(await fetchLeadActivity(ACCESS, 1_000)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never writes the operator key to the log when a read fails", async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await fetchLeadActivity(ACCESS, 1_000);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(ACCESS.operatorKey);
  });
});

describe("fetchConversation", () => {
  it("returns the messages of one session, asking for that session alone", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ role: "user", content: "Hello", timestamp: "2026-10-16T09:00:00+00:00" }] }));

    const result = await fetchConversation(ACCESS, "s 1/2");

    expect(result).toEqual({ status: "ok", messages: [{ author: "visitor", text: "Hello", at: new Date("2026-10-16T09:00:00Z") }] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://oyechats.test:8000/leads/s%201%2F2");
  });

  it("says not-found for a session OyeChats does not have for this bot", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Lead not found" }, 404));
    expect(await fetchConversation(ACCESS, "gone")).toEqual({ status: "not-found" });
  });

  it("says unavailable for a refusal, an error, a malformed answer, or no configured address", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403));
    expect(await fetchConversation(ACCESS, "s1")).toEqual({ status: "unavailable" });

    fetchMock.mockResolvedValueOnce(json({ unexpected: true }));
    expect(await fetchConversation(ACCESS, "s1")).toEqual({ status: "unavailable" });

    fetchMock.mockRejectedValueOnce(new Error("boom"));
    expect(await fetchConversation(ACCESS, "s1")).toEqual({ status: "unavailable" });

    vi.stubEnv("OYECHATS_API_URL", "");
    fetchMock.mockClear();
    expect(await fetchConversation(ACCESS, "s1")).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
