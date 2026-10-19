import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandbasketGet } from "../lib/brandbasket";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.BRANDBASKET_API_ORIGIN = "https://app.example.test";
  process.env.BRANDBASKET_SITE_TOKEN = "token-1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("brandbasketGet", () => {
  it("returns the data and sends the site token", async () => {
    fetchMock.mockResolvedValue(Response.json({ business: "Firstfold" }));

    await expect(brandbasketGet("/api/site/info")).resolves.toEqual({ kind: "ok", data: { business: "Firstfold" } });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://app.example.test/api/site/info");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
  });

  it("reports offline when the plan has ended", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "This website is offline.", code: "site_offline" }, { status: 403 }));
    await expect(brandbasketGet("/api/site/info")).resolves.toEqual({ kind: "offline" });
  });

  it("does not mistake another 403 for offline", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "no" }, { status: 403 }));
    await expect(brandbasketGet("/api/site/info")).resolves.toEqual({ kind: "error", status: 403 });
  });

  it("reports a bad token as an error, not offline", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "A valid site API token is required." }, { status: 401 }));
    await expect(brandbasketGet("/api/site/info")).resolves.toEqual({ kind: "error", status: 401 });
  });

  it("reports an unreachable platform as status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(brandbasketGet("/api/site/info")).resolves.toEqual({ kind: "error", status: 0 });
  });

  it("refuses to run without its settings", async () => {
    delete process.env.BRANDBASKET_SITE_TOKEN;
    await expect(brandbasketGet("/api/site/info")).rejects.toThrow("BRANDBASKET_SITE_TOKEN is not set.");
  });
});
