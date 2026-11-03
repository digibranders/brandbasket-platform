import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversation, oyechatsApiOrigin, parseConversation } from "./oyechats-api";

const ACCESS = { oyechatsBotId: 41, operatorKey: "fedcba9876543210fedcba9876543210" } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
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

  it("reads a time without a zone as UTC", () => {
    expect(parseConversation({ messages: [{ role: "user", content: "x", timestamp: "2026-10-16T09:30:00" }] })?.[0]?.at).toEqual(new Date("2026-10-16T09:30:00Z"));
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

describe("fetchConversation", () => {
  it("returns the messages of one session, asking for that session alone with the bot's own key", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ role: "user", content: "Hello", timestamp: "2026-10-16T09:00:00+00:00" }] }));
    const result = await fetchConversation(ACCESS, "s 1/2");
    expect(result).toEqual({ status: "ok", messages: [{ author: "visitor", text: "Hello", at: new Date("2026-10-16T09:00:00Z") }] });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://oyechats.test:8000/leads/s%201%2F2");
    expect(init?.headers).toMatchObject({ "X-Operator-Key": ACCESS.operatorKey });
    expect(init?.redirect).toBe("error");
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

  it("never writes the operator key to the log when a read fails", async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await fetchConversation(ACCESS, "s1");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(ACCESS.operatorKey);
  });
});
