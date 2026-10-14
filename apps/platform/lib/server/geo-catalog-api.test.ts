import { describe, expect, it, vi } from "vitest";
import { handleGeoCatalog } from "./geo-catalog-api";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const SNAPSHOT = { districts: [{ stateCode: "mh", slug: "thane", name: "Thane", status: "live" as const }], areas: [], categories: [] };

function request(token?: string): Request {
  return new Request("http://app.test/api/directory/catalog", token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });
}

describe("GET /api/directory/catalog", () => {
  it("sends the catalog to the website's server", async () => {
    const response = await handleGeoCatalog(request(TOKEN), { token: TOKEN, readCatalog: async () => SNAPSHOT });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contract: 1, ...SNAPSHOT });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a request without the token, or a wrong one", async () => {
    const readCatalog = vi.fn(async () => SNAPSHOT);
    expect((await handleGeoCatalog(request(), { token: TOKEN, readCatalog })).status).toBe(401);
    expect((await handleGeoCatalog(request("x".repeat(40)), { token: TOKEN, readCatalog })).status).toBe(401);
    expect(readCatalog).not.toHaveBeenCalled();
  });

  it("is unavailable when the token is not set or the read fails", async () => {
    expect((await handleGeoCatalog(request(TOKEN), { token: null, readCatalog: async () => SNAPSHOT })).status).toBe(503);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = await handleGeoCatalog(request(TOKEN), { token: TOKEN, readCatalog: async () => Promise.reject(new Error("down")) });
    expect(failing.status).toBe(503);
  });
});
