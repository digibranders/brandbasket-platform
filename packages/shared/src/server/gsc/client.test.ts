import { describe, expect, it, vi } from "vitest";
import { GoogleAccessLost } from "../google/oauth";
import { createGscReader, GscError } from "./client";
import { dailyRequest } from "./report";

const request = dailyRequest("2026-11-01", "2026-11-02");
const reader = (fetchFn: typeof fetch, token = async () => "tok") => createGscReader(token, fetchFn);

describe("the Search Console reader", () => {
  it("posts to the encoded site address with the bearer token and parses the rows", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ rows: [{ keys: ["2026-11-01"], clicks: 1, impressions: 2, ctr: 0.5, position: 3 }] })));
    const rows = await reader(fetchFn as unknown as typeof fetch).searchAnalytics("https://example.in/", request);
    expect(rows.rows).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.in%2F/searchAnalytics/query");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
  it("answers an empty day set as no rows", async () => {
    expect((await reader((async () => new Response("{}")) as typeof fetch).searchAnalytics("https://example.in/", request)).rows).toEqual([]);
  });
  it.each([[403, "access_lost"], [401, "access_lost"], [404, "bad_property"], [400, "bad_property"], [429, "quota"], [503, "unavailable"]])("classes HTTP %i as %s and keeps no Google words", async (status, failure) => {
    const error = await reader((async () => new Response(JSON.stringify({ error: { message: "site https://secret.example/" } }), { status })) as typeof fetch).searchAnalytics("https://example.in/", request).catch((caught: unknown) => caught as GscError);
    expect(error).toMatchObject({ failure });
    expect((error as GscError).message).not.toContain("secret");
  });
  it("calls an unreachable Google unavailable but lets a lost account sign-in through", async () => {
    await expect(reader((async () => { throw new Error("offline"); }) as typeof fetch).searchAnalytics("https://example.in/", request)).rejects.toMatchObject({ failure: "unavailable" });
    await expect(reader((async () => new Response("{}")) as typeof fetch, async () => { throw new GoogleAccessLost(); }).searchAnalytics("https://example.in/", request)).rejects.toBeInstanceOf(GoogleAccessLost);
  });
});
