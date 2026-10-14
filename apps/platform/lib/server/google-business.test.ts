import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { exchangeGoogleCode, fetchGoogleLocations, GoogleBusinessError, googleAuthorizeUrl, toImportedLocation } = await import(
  "./google-business"
);

const CONFIG = { clientId: "client-1.apps.googleusercontent.com", clientSecret: "secret-1", redirectUri: "https://app.fynix.digital/google-business/callback" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("googleAuthorizeUrl", () => {
  it("asks for Business Profile access once, with our state", () => {
    const url = new URL(googleAuthorizeUrl(CONFIG, "state-abc"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/business.manage",
      access_type: "online",
      prompt: "select_account",
      state: "state-abc",
    });
  });
});

describe("exchangeGoogleCode", () => {
  it("posts the code and returns the access token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ access_token: "token-1", token_type: "Bearer", expires_in: 3599 }));
    expect(await exchangeGoogleCode(CONFIG, "code-1", fetchImpl)).toBe("token-1");
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      code: "code-1",
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      redirect_uri: CONFIG.redirectUri,
      grant_type: "authorization_code",
    });
  });

  it("throws a GoogleBusinessError when Google refuses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "invalid_grant" }, 400));
    await expect(exchangeGoogleCode(CONFIG, "code-1", fetchImpl)).rejects.toBeInstanceOf(GoogleBusinessError);
  });
});

describe("fetchGoogleLocations", () => {
  it("reads each account's locations with the token, up to the limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://mybusinessaccountmanagement.googleapis.com/v1/accounts")) {
        return json({ accounts: [{ name: "accounts/1" }, { name: "accounts/2" }] });
      }
      if (url.startsWith("https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations")) {
        return json({ locations: [{ name: "locations/10", title: "Gentle Dental" }] });
      }
      return json({});
    });
    const locations = await fetchGoogleLocations("token-1", fetchImpl);
    expect(locations.map((location) => location.name)).toEqual(["locations/10"]);
    for (const [, init] of fetchImpl.mock.calls) expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-1");
    const locationsUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(locationsUrl.searchParams.get("readMask")).toBe("name,title,phoneNumbers,storefrontAddress,websiteUri,latlng,regularHours,profile,metadata");
  });

  it("throws a GoogleBusinessError when an API call fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { code: 403 } }, 403));
    await expect(fetchGoogleLocations("token-1", fetchImpl)).rejects.toBeInstanceOf(GoogleBusinessError);
  });
});

describe("toImportedLocation", () => {
  it("maps a Business Profile location to the Details tab's fields", () => {
    expect(
      toImportedLocation({
        name: "locations/10",
        title: "Gentle Dental",
        phoneNumbers: { primaryPhone: "098200 77001" },
        storefrontAddress: { addressLines: ["12 Gokhale Road", "Naupada"], locality: "Thane", postalCode: "400602" },
        websiteUri: "https://gentledental.in",
        metadata: { mapsUri: "https://maps.google.com/maps?cid=123" },
        profile: { description: "  Family dentist since 2004.  " },
        regularHours: {
          periods: [
            { openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 13 } },
            { openDay: "MONDAY", openTime: { hours: 16, minutes: 30 }, closeDay: "MONDAY", closeTime: { hours: 20 } },
            { openDay: "SATURDAY", openTime: {}, closeDay: "SUNDAY", closeTime: { hours: 24 } },
          ],
        },
      }),
    ).toEqual({
      id: "locations/10",
      name: "Gentle Dental",
      address: "12 Gokhale Road, Naupada, Thane 400602",
      phone: "098200 77001",
      website: "https://gentledental.in",
      mapsUrl: "https://maps.google.com/maps?cid=123",
      about: "Family dentist since 2004.",
      hours: [
        { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "20:00" },
        { dayOfWeek: 1, mode: "closed" },
        { dayOfWeek: 2, mode: "closed" },
        { dayOfWeek: 3, mode: "closed" },
        { dayOfWeek: 4, mode: "closed" },
        { dayOfWeek: 5, mode: "all-day" },
        { dayOfWeek: 6, mode: "closed" },
      ],
    });
  });

  it("builds a map link from the pin when there is no Maps link, and leaves out what is missing", () => {
    expect(toImportedLocation({ name: "locations/11", latlng: { latitude: 19.19, longitude: 72.97 } })).toEqual({
      id: "locations/11",
      name: "",
      address: "",
      phone: "",
      website: "",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=19.19%2C72.97",
      about: "",
      hours: [],
    });
  });
});
