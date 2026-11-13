import { describe, expect, it, vi } from "vitest";
import { sendGa4, sendMeta } from "./senders";

const GA4 = { measurementId: "G-ABC123", apiSecret: "s3cret" };
const META = { pixelId: "123", accessToken: "tok-xyz", graphVersion: "v23.0", testEventCode: null };
const GA4_BODY = { client_id: "1.2", events: [{ name: "purchase" as const, params: { transaction_id: "pay_1" } }] } as const;
const META_BODY = { data: [{ event_name: "Purchase" }] } as never;

describe("sendGa4", () => {
  it("posts the body to the Measurement Protocol with the keys in the address", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await sendGa4(GA4, GA4_BODY, fetcher);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://www.google-analytics.com/mp/collect?measurement_id=G-ABC123&api_secret=s3cret");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(GA4_BODY);
  });

  it("throws, naming the status and nothing else, when Google does not take it", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("secret details", { status: 500 }));
    await expect(sendGa4(GA4, GA4_BODY, fetcher)).rejects.toThrow("GA4 answered 500");
  });

  it("throws without the secret when the request itself fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed for https://www.google-analytics.com/mp/collect?measurement_id=G-ABC123&api_secret=s3cret");
    });
    await expect(sendGa4(GA4, GA4_BODY, fetcher)).rejects.toThrow(/^GA4 request failed$/);
  });
});

describe("sendMeta", () => {
  it("posts to the pixel's events edge with the token in the body, never in the address", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await sendMeta(META, META_BODY, fetcher);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://graph.facebook.com/v23.0/123/events");
    expect(String(url)).not.toContain("tok-xyz");
    expect(JSON.parse(String(init?.body))).toEqual({ data: [{ event_name: "Purchase" }], access_token: "tok-xyz" });
  });

  it("adds the test event code when one is set", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await sendMeta({ ...META, testEventCode: "TEST123" }, META_BODY, fetcher);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ test_event_code: "TEST123" });
  });

  it("throws, naming the status and nothing else, when Meta does not take it", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{"error":{"message":"Invalid token tok-xyz"}}', { status: 400 }));
    await expect(sendMeta(META, META_BODY, fetcher)).rejects.toThrow(/^Meta answered 400$/);
  });
});
