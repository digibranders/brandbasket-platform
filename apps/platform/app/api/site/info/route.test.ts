import { beforeEach, describe, expect, it, vi } from "vitest";
import { readBookingContext, readPractitionerSchedules, readSiteFacts } from "@firstfold/db";
import { getStaffDb } from "@/lib/server/db";
import { findTenantBySiteToken } from "@/lib/server/site-api";
import { GET, OPTIONS } from "./route";

/*
 * The pure shape of the response is proven in lib/server/site-info.test.ts (buildSiteInfo). What belongs here is
 * the route's own behavior: auth, and that every response — success or failure — carries the right headers.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/site-api", () => ({ findTenantBySiteToken: vi.fn() }));
vi.mock("@firstfold/db", () => ({ readBookingContext: vi.fn(), readPractitionerSchedules: vi.fn(), readSiteFacts: vi.fn() }));

const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedFindTenant = vi.mocked(findTenantBySiteToken);
const mockedReadBookingContext = vi.mocked(readBookingContext);
const mockedReadSiteFacts = vi.mocked(readSiteFacts);
const mockedReadPractitionerSchedules = vi.mocked(readPractitionerSchedules);

const TOKEN = "t".repeat(40);
const URL = "http://app.localhost:3001/api/site/info";

function request(headers: Record<string, string> = {}): Request {
  return new Request(URL, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetStaffDb.mockReturnValue({} as never);
  mockedFindTenant.mockResolvedValue({ businessId: "biz-1", name: "Smile Dental" });
  mockedReadSiteFacts.mockResolvedValue({ timeZone: "Asia/Kolkata", hours: [], closures: [], announcement: null });
  mockedReadBookingContext.mockResolvedValue({ enabled: false, timeZone: null, settings: null, services: [] });
  mockedReadPractitionerSchedules.mockResolvedValue([]);
});

describe("GET /api/site/info", () => {
  it("refuses a request with no bearer token, with CORS and no-store headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockedFindTenant).not.toHaveBeenCalled();
  });

  it("refuses a request with an unknown bearer token, with CORS and no-store headers", async () => {
    mockedFindTenant.mockResolvedValue(null);
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 500 with CORS and no-store headers when the token lookup itself throws", async () => {
    mockedFindTenant.mockRejectedValue(new Error("Payload connection reset"));
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 500 with CORS and no-store headers when reading facts or booking throws", async () => {
    mockedReadSiteFacts.mockRejectedValue(new Error("connection lost"));
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 200 with CORS, Vary: Authorization and a 60s cache on success", async () => {
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});

describe("GET /api/site/info practitioners", () => {
  it("lists the business's active doctors under booking, read for the token's own business", async () => {
    mockedReadBookingContext.mockResolvedValue({
      enabled: true,
      timeZone: "Asia/Kolkata",
      settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
      services: [],
    });
    mockedReadPractitionerSchedules.mockResolvedValue([
      { id: "p1", name: "Dr. Asha Rao", title: "Orthodontist", photoMediaId: null, usesClinicHours: true, hours: [], leave: [] },
    ]);
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ booking: { practitioners: [{ id: "p1", name: "Dr. Asha Rao", title: "Orthodontist", photoUrl: null }] } });
    expect(mockedReadPractitionerSchedules).toHaveBeenCalledWith(expect.anything(), "biz-1");
  });

  it("never reads the doctors while online booking is off, and answers a null booking", async () => {
    const response = await GET(request({ authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ booking: null });
    expect(mockedReadPractitionerSchedules).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/site/info", () => {
  it("answers a bare preflight with CORS headers", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Vary")).toBe("Authorization");
  });
});
