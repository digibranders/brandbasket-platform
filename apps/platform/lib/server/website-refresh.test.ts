import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./website-origin", () => ({ websiteOrigin: () => "https://brandbasket.in" }));

import { after } from "next/server";
import { refreshWebsiteBusiness, scheduleWebsiteRefresh, websiteIdOf } from "./website-refresh";

const TOKEN = "t".repeat(40);

beforeEach(() => {
  vi.stubEnv("LEADS_API_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("websiteIdOf", () => {
  it("is the permanent id, or the listing key for a business without one", () => {
    expect(websiteIdOf({ placeId: "k7m2q9a", listingKey: "dentists/thane/naupada/smile-dental" })).toBe("k7m2q9a");
    expect(websiteIdOf({ placeId: null, listingKey: "dentists/thane/naupada/smile-dental" })).toBe("dentists/thane/naupada/smile-dental");
  });
});

describe("refreshWebsiteBusiness", () => {
  it("posts the business's id to the website with the shared secret", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await refreshWebsiteBusiness({ placeId: "k7m2q9a", listingKey: null });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://brandbasket.in/api/directory-refresh");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(JSON.parse(String(init.body))).toEqual({ id: "k7m2q9a" });
  });

  it("does nothing, and says nothing, with no shared secret configured", async () => {
    vi.stubEnv("LEADS_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshWebsiteBusiness({ placeId: "k7m2q9a", listingKey: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the website is down or refuses", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(refreshWebsiteBusiness({ placeId: "k7m2q9a", listingKey: null })).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(refreshWebsiteBusiness({ placeId: "k7m2q9a", listingKey: null })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe("scheduleWebsiteRefresh", () => {
  it("hands the telling to after(), so the response is not held up", () => {
    scheduleWebsiteRefresh({ placeId: "k7m2q9a", listingKey: null });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("still tells the website, and does not throw, outside a request", () => {
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(() => scheduleWebsiteRefresh({ placeId: "k7m2q9a", listingKey: null })).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
