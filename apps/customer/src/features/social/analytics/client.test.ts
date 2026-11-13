import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAnalytics, PostingServiceError } from "./client";

const WINDOW = { from: "2026-10-01", to: "2026-11-11" };
const respond = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

afterEach(() => vi.unstubAllEnvs());

describe("fetchAnalytics", () => {
  it("asks for the business's workspace with the product key and reads the answer", async () => {
    vi.stubEnv("SOCIAL_AUTO_URL", "http://127.0.0.1:4020");
    vi.stubEnv("SOCIAL_AUTO_KEY", "secret");
    const send = respond(200, { channels: [], posts: [], accounts: [], hashtags: [] });
    const read = await fetchAnalytics("b1", WINDOW, send);
    expect(read).toMatchObject({ posts: [], hashtags: [] });
    const [url, init] = vi.mocked(send).mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:4020/api/v1/analytics?externalId=b1&from=2026-10-01&to=2026-11-11");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
  });

  it("has nothing to give yet when there is no workspace or analytics is not switched on", async () => {
    vi.stubEnv("SOCIAL_AUTO_URL", "http://127.0.0.1:4020");
    vi.stubEnv("SOCIAL_AUTO_KEY", "secret");
    expect(await fetchAnalytics("b1", WINDOW, respond(404))).toBeNull();
    expect(await fetchAnalytics("b1", WINDOW, respond(503))).toBeNull();
  });

  it("throws on any other refusal, so the panel shows its error state", async () => {
    vi.stubEnv("SOCIAL_AUTO_URL", "http://127.0.0.1:4020");
    vi.stubEnv("SOCIAL_AUTO_KEY", "secret");
    await expect(fetchAnalytics("b1", WINDOW, respond(500))).rejects.toBeInstanceOf(PostingServiceError);
  });

  it("throws when this server has no posting service address", async () => {
    vi.stubEnv("SOCIAL_AUTO_URL", "");
    vi.stubEnv("SOCIAL_AUTO_KEY", "");
    await expect(fetchAnalytics("b1", WINDOW, respond(200))).rejects.toBeInstanceOf(PostingServiceError);
  });
});
