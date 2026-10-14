import { describe, expect, it, vi } from "vitest";
import type { VisibleOpenListing } from "@firstfold/db";
import { handleOpenListingsPage, handleOpenListingsVersion, toTuple } from "./open-listings-api";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const LISTING: VisibleOpenListing = {
  placeId: "z8p6tbs", name: "Shiv Drushti", categorySlug: "dentists", citySlug: "thane", areaSlug: "anand-nagar",
  address: "Anand Nagar 400607", lat: 19.27, lon: 72.96, website: "", source: "survey",
  phone: { e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true },
  urlCitySlug: "thane", urlSlug: "shiv-drushti",
};

function get(path: string, token: string | null = TOKEN): Request {
  return new Request(`https://app.firstfold.io${path}`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } });
}

describe("toTuple", () => {
  it("writes the website's row order, then the phone", () => {
    expect(toTuple(LISTING)).toEqual([
      "Shiv Drushti", "dentists", "thane", "anand-nagar", "Anand Nagar 400607", 19.27, 72.96, "", "survey",
      "z8p6tbs", "thane", "shiv-drushti", "+919850004227", "call", "2026-10-05", true,
    ]);
    expect(toTuple({ ...LISTING, phone: null }).slice(12)).toEqual([null, null, null, false]);
  });
});

describe("handleOpenListingsVersion", () => {
  it("answers the version to the website", async () => {
    const res = await handleOpenListingsVersion(get("/api/directory/open-listings/version"), { token: TOKEN, readVersion: async () => "1|a|b" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contract: 1, version: "1|a|b" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses without the token, and when the platform has none", async () => {
    expect((await handleOpenListingsVersion(get("/x", null), { token: TOKEN, readVersion: async () => "v" })).status).toBe(401);
    expect((await handleOpenListingsVersion(get("/x", "wrong".repeat(10)), { token: TOKEN, readVersion: async () => "v" })).status).toBe(401);
    expect((await handleOpenListingsVersion(get("/x"), { token: null, readVersion: async () => "v" })).status).toBe(503);
  });
});

describe("handleOpenListingsPage", () => {
  it("answers one page with the next cursor", async () => {
    const readPage = vi.fn(async () => [LISTING]);
    const res = await handleOpenListingsPage(get("/api/directory/open-listings?limit=1"), {
      token: TOKEN, readVersion: async () => "v1", readPage,
    });
    expect(res.status).toBe(200);
    expect(readPage).toHaveBeenCalledWith({ after: null, limit: 1 });
    expect(await res.json()).toEqual({ contract: 1, version: "v1", listings: [toTuple(LISTING)], next: "z8p6tbs" });
  });

  it("gives no cursor on a short last page", async () => {
    const res = await handleOpenListingsPage(get("/api/directory/open-listings?after=k7m2q9a&limit=5"), {
      token: TOKEN, readVersion: async () => "v1", readPage: async () => [LISTING],
    });
    expect((await res.json()).next).toBeNull();
  });

  it("refuses a bad cursor or limit", async () => {
    const deps = { token: TOKEN, readVersion: async () => "v1", readPage: async () => [] };
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?after=NOPE"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=0"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=5001"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=1e3"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=%205"), deps)).status).toBe(400);
  });

  it("answers 503 when the database fails", async () => {
    const res = await handleOpenListingsPage(get("/api/directory/open-listings"), {
      token: TOKEN, readVersion: async () => { throw new Error("down"); }, readPage: async () => [],
    });
    expect(res.status).toBe(503);
  });
});
