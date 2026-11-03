import { describe, expect, it, vi } from "vitest";
import { createAnalyticsAdmin, KEY_EVENTS } from "./admin";
import { callGoogle } from "./http";
import { createSiteVerification, tokenFromMeta } from "./site-verification";

const token = async () => "tok";
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const fetching = (...answers: Response[]) => {
  const fn = vi.fn(async () => answers.shift() ?? json({}));
  return fn as unknown as typeof fetch & typeof fn;
};
const urlOf = (fn: { mock: { calls: unknown[][] } }, index = 0): string => String(fn.mock.calls[index]?.[0]);
const bodyOf = (fn: { mock: { calls: unknown[][] } }, index = 0): unknown => JSON.parse(String((fn.mock.calls[index]?.[1] as RequestInit).body));

describe("callGoogle", () => {
  it("returns an accepted status, keeps no Google words in an error, and calls an unreachable Google unavailable", async () => {
    expect((await callGoogle(token, { method: "GET", url: "https://x.test/", what: "X", accept: [409] }, fetching(json({}, 409)))).status).toBe(409);
    const denied = callGoogle(token, { method: "GET", url: "https://x.test/", what: "X" }, fetching(json({ error: { message: "property secret-1" } }, 403)));
    await expect(denied).rejects.toMatchObject({ status: 403, failure: "access_lost", message: "X answered HTTP 403." });
    await expect(callGoogle(token, { method: "GET", url: "https://x.test/", what: "X" }, (async () => { throw new Error("off"); }) as typeof fetch)).rejects.toMatchObject({ failure: "unavailable" });
  });
});

describe("the Analytics Admin API", () => {
  it("finds an account by name with its properties, or null", async () => {
    const summaries = { accountSummaries: [{ account: "accounts/1", displayName: "Brandbasket clients", propertySummaries: [{ property: "properties/9", displayName: "Kulkarni (abc)" }] }] };
    const admin = createAnalyticsAdmin(token, fetching(json(summaries), json(summaries)));
    expect(await admin.findAccount("Brandbasket clients")).toEqual({ account: "accounts/1", properties: [{ property: "properties/9", displayName: "Kulkarni (abc)" }] });
    expect(await admin.findAccount("Other")).toBeNull();
  });
  it("makes a property in India's zone and currency, then a web stream, and returns the ids", async () => {
    const fn = fetching(json({ name: "properties/12345" }), json({ webStreamData: { measurementId: "G-ABC123" } }));
    const admin = createAnalyticsAdmin(token, fn);
    expect(await admin.createProperty("accounts/1", "Kulkarni (abc)")).toBe("12345");
    expect(bodyOf(fn)).toMatchObject({ parent: "accounts/1", timeZone: "Asia/Kolkata", currencyCode: "INR" });
    expect(await admin.createWebStream("12345", "https://kulkarni.example/", "Kulkarni site")).toBe("G-ABC123");
    expect(urlOf(fn, 1)).toContain("/properties/12345/dataStreams");
  });
  it("treats an existing key event as done and surfaces any other failure", async () => {
    const admin = createAnalyticsAdmin(token, fetching(json({}, 409), json({}, 403)));
    await admin.createKeyEvent("12345", KEY_EVENTS[0]);
    await expect(admin.createKeyEvent("12345", KEY_EVENTS[1])).rejects.toMatchObject({ failure: "access_lost" });
  });
});

describe("Site Verification and Search Console sites", () => {
  const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-AbCdEf";
  it("reads the token out of the meta tag Google hands back", async () => {
    expect(tokenFromMeta(`<meta name="google-site-verification" content="${TOKEN}" />`)).toBe(TOKEN);
    expect(tokenFromMeta("nothing")).toBeNull();
    const verification = createSiteVerification(token, fetching(json({ method: "META", token: `<meta name="google-site-verification" content="${TOKEN}" />` })));
    expect(await verification.metaToken("https://kulkarni.example/")).toBe(TOKEN);
  });
  it("says false while the site does not show the tag, true once Google accepts it", async () => {
    const verification = createSiteVerification(token, fetching(json({ error: {} }, 400), json({ id: "x", owners: [] })));
    expect(await verification.verify("https://kulkarni.example/")).toBe(false);
    expect(await verification.verify("https://kulkarni.example/")).toBe(true);
  });
  it("adds the site to Search Console, and lists and sets the owners on the encoded site", async () => {
    const fn = fetching(json({}), json({ owners: ["a@x.com"] }), json({}));
    const verification = createSiteVerification(token, fn);
    await verification.addToSearchConsole("https://kulkarni.example/");
    expect(urlOf(fn)).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fkulkarni.example%2F");
    expect(await verification.owners("https://kulkarni.example/")).toEqual(["a@x.com"]);
    await verification.setOwners("https://kulkarni.example/", ["a@x.com", "b@x.com"]);
    expect(urlOf(fn, 2)).toBe("https://www.googleapis.com/siteVerification/v1/webResource/https%3A%2F%2Fkulkarni.example%2F");
    expect(bodyOf(fn, 2)).toEqual({ site: { type: "SITE", identifier: "https://kulkarni.example/" }, owners: ["a@x.com", "b@x.com"] });
  });
});
