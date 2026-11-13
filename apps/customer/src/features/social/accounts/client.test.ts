import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureWorkspace, fetchChannels, fetchConnectLink } from "./client";
import { PostingServiceError } from "../posting-service";

vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.com" }) }));

const respond = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const on = () => {
  vi.stubEnv("SOCIAL_AUTO_URL", "http://127.0.0.1:4020");
  vi.stubEnv("SOCIAL_AUTO_KEY", "secret");
};
afterEach(() => vi.unstubAllEnvs());

describe("fetchChannels", () => {
  it("asks for the business's workspace and reads its channels, and a business with no workspace has none", async () => {
    on();
    const send = respond(200, { workspace: { channels: [{ id: "instagram:1", platform: "instagram", account: "acme", connectedAt: "2026-11-01T00:00:00Z" }] } });
    expect((await fetchChannels("b1", send)).map((one) => one.id)).toEqual(["instagram:1"]);
    expect(String(vi.mocked(send).mock.calls[0]?.[0])).toBe("http://127.0.0.1:4020/api/v1/workspaces?externalId=b1");
    expect(await fetchChannels("b1", respond(404))).toEqual([]);
  });

  it("throws on any other refusal, so the panel shows its error state", async () => {
    on();
    await expect(fetchChannels("b1", respond(500))).rejects.toBeInstanceOf(PostingServiceError);
  });
});

describe("ensureWorkspace and fetchConnectLink", () => {
  it("makes the workspace for the business under its own id, and the link carries the network and where to return", async () => {
    on();
    const make = respond(201, { workspace: { channels: [] } });
    await ensureWorkspace({ id: "b1", name: "Om Sweets" }, make);
    expect(JSON.parse(String(vi.mocked(make).mock.calls[0]?.[1]?.body))).toEqual({ externalId: "b1", name: "Om Sweets" });
    const link = respond(200, { url: "http://127.0.0.1:4020/connect/abc" });
    expect(await fetchConnectLink("b1", "instagram", "https://app.example.com/social/accounts", link)).toBe("http://127.0.0.1:4020/connect/abc");
    expect(JSON.parse(String(vi.mocked(link).mock.calls[0]?.[1]?.body))).toEqual({ externalId: "b1", channel: "instagram", returnUrl: "https://app.example.com/social/accounts" });
  });

  it("refuses a link that is not a safe address, and a refusal from the service", async () => {
    on();
    await expect(fetchConnectLink("b1", "instagram", "https://x", respond(200, { url: "http://evil.example.com" }))).rejects.toBeInstanceOf(PostingServiceError);
    await expect(fetchConnectLink("b1", "instagram", "https://x", respond(400, { error: "bad return address" }))).rejects.toMatchObject({ status: 400, detail: "bad return address" });
  });
});
