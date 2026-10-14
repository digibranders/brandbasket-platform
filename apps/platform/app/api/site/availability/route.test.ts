import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBusyIntervals, readBookingContext, readPractitionerSchedules, readSiteFacts } from "@firstfold/db";
import { getStaffDb } from "@/lib/server/db";
import { findTenantBySiteToken } from "@/lib/server/site-api";
import { GET, OPTIONS } from "./route";

/*
 * The pure shape of the response is proven in lib/server/availability.test.ts (resolveAvailabilityWindow,
 * buildAvailabilityResponse) and lib/server/local-time.test.ts (utcIntervalToLocal). What belongs here is the
 * route's own behavior: auth, status-code mapping and that every response carries the right headers.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/site-api", () => ({ findTenantBySiteToken: vi.fn() }));
vi.mock("@firstfold/db", () => ({
  readBookingContext: vi.fn(),
  readSiteFacts: vi.fn(),
  listBusyIntervals: vi.fn(),
  readPractitionerSchedules: vi.fn(),
}));

const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedFindTenant = vi.mocked(findTenantBySiteToken);
const mockedReadBookingContext = vi.mocked(readBookingContext);
const mockedReadSiteFacts = vi.mocked(readSiteFacts);
const mockedListBusyIntervals = vi.mocked(listBusyIntervals);
const mockedReadPractitionerSchedules = vi.mocked(readPractitionerSchedules);

const DOCTOR_A = "01923a4e-7b3a-7c3e-8f3a-00000000000a";
const DOCTOR_B = "01923a4e-7b3a-7c3e-8f3a-00000000000b";
const MONDAY_HOURS = [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "17:00:00", closed: false, openAllDay: false }];

const TOKEN = "t".repeat(40);
const URL = "http://app.localhost:3001/api/site/availability";

function request(query = "", headers: Record<string, string> = {}): Request {
  return new Request(`${URL}${query}`, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetStaffDb.mockReturnValue({} as never);
  mockedFindTenant.mockResolvedValue({ businessId: "biz-1", name: "Smile Dental" });
  mockedReadSiteFacts.mockResolvedValue({ timeZone: "Asia/Kolkata", hours: [], closures: [], announcement: null });
  mockedReadBookingContext.mockResolvedValue({
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [],
  });
  mockedListBusyIntervals.mockResolvedValue([]);
  mockedReadPractitionerSchedules.mockResolvedValue([
    { id: DOCTOR_A, name: "Dr. A", title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [] },
    { id: DOCTOR_B, name: "Dr. B", title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [] },
  ]);
});

describe("GET /api/site/availability", () => {
  it("refuses a request with no bearer token, with CORS and no-store headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockedFindTenant).not.toHaveBeenCalled();
  });

  it("refuses a request with an unknown bearer token", async () => {
    mockedFindTenant.mockResolvedValue(null);
    const response = await GET(request("", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(401);
  });

  it("answers 500 when the token lookup itself throws", async () => {
    mockedFindTenant.mockRejectedValue(new Error("Payload connection reset"));
    const response = await GET(request("", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 403 unavailable when the module is off", async () => {
    mockedReadBookingContext.mockResolvedValue({ enabled: false, timeZone: null, settings: null, services: [] });
    const response = await GET(request("", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", code: "unavailable" });
  });

  it("answers 409 paused with the business's message", async () => {
    mockedReadBookingContext.mockResolvedValue({
      enabled: true,
      timeZone: "Asia/Kolkata",
      settings: { accepting: false, pausedMessage: "Back on Monday", slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
      services: [],
    });
    const response = await GET(request("", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ status: "error", code: "paused", message: "Back on Monday" });
  });

  it("answers 400 on a malformed week param", async () => {
    const response = await GET(request("?week=not-a-date", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "week" });
  });

  it("answers 200 with the availability, CORS, Vary: Authorization and no-store", async () => {
    const response = await GET(request("?week=2026-01-05", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.weekStart).toBe("2026-01-05");
    expect(body.days).toHaveLength(7);
  });

  it("answers 500 with the same shape as the other endpoints' failures when reading busy intervals throws", async () => {
    mockedListBusyIntervals.mockRejectedValue(new Error("connection lost"));
    const response = await GET(request("", { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "error",
      code: "failed",
      message: "Something went wrong. Please try again or call us.",
      field: null,
    });
  });

  it("passes the correct UTC range for the requested week (Asia/Kolkata, UTC+5:30) to listBusyIntervals", async () => {
    await GET(request("?week=2026-01-05", { authorization: `Bearer ${TOKEN}` }));
    expect(mockedListBusyIntervals).toHaveBeenCalledTimes(1);
    const [, businessId, fromUtc, toUtc] = mockedListBusyIntervals.mock.calls[0] ?? [];
    expect(businessId).toBe("biz-1");
    // Local midnight 2026-01-05 in Asia/Kolkata (UTC+5:30) is 2026-01-04T18:30:00Z; the week's end is the same
    // wall-clock instant 7 days later.
    expect(fromUtc).toEqual(new Date("2026-01-04T18:30:00.000Z"));
    expect(toUtc).toEqual(new Date("2026-01-11T18:30:00.000Z"));
  });

  it("normalises a mid-week param to its Monday before computing the UTC range", async () => {
    await GET(request("?week=2026-01-08", { authorization: `Bearer ${TOKEN}` })); // a Thursday
    const [, , fromUtc] = mockedListBusyIntervals.mock.calls[0] ?? [];
    expect(fromUtc).toEqual(new Date("2026-01-04T18:30:00.000Z"));
  });
});

describe("GET /api/site/availability?practitioner=", () => {
  /** The route reads the real clock, so it is pinned to the Sunday evening before WEEK (Asia/Kolkata): every Monday
   * slot is then past the notice period and inside the horizon. */
  const WEEK = "2026-01-05";

  function mondaySlotAt(body: { days: readonly { slots: readonly { start: string; state: string }[] }[] }, start: string): string | undefined {
    return body.days[0]?.slots.find((slot) => slot.start === start)?.state;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-04T12:00:00Z"));
    mockedReadSiteFacts.mockResolvedValue({ timeZone: "Asia/Kolkata", hours: MONDAY_HOURS, closures: [], announcement: null });
    // 2026-01-05 10:00-10:30 in Asia/Kolkata, with doctor A.
    mockedListBusyIntervals.mockResolvedValue([
      { startsAt: new Date("2026-01-05T04:30:00Z"), endsAt: new Date("2026-01-05T05:00:00Z"), practitionerId: DOCTOR_A },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers 400 on a practitioner param that is not a uuid, without reading any calendars", async () => {
    const response = await GET(request(`?week=${WEEK}&practitioner=dr-a`, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "error", code: "invalid", message: "Choose a doctor from the list.", field: "practitioner" });
    expect(mockedListBusyIntervals).not.toHaveBeenCalled();
  });

  it("answers 400 on a uuid that is not one of the business's active doctors", async () => {
    const response = await GET(request(`?week=${WEEK}&practitioner=01923a4e-7b3a-7c3e-8f3a-0000000000ff`, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid", field: "practitioner" });
  });

  it("shows a slot free for any doctor while another doctor can still take it", async () => {
    const response = await GET(request(`?week=${WEEK}`, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    expect(mondaySlotAt(await response.json(), "10:00")).toBe("free");
  });

  it("shows only the chosen doctor's calendar", async () => {
    const busyDoctor = await GET(request(`?week=${WEEK}&practitioner=${DOCTOR_A}`, { authorization: `Bearer ${TOKEN}` }));
    expect(busyDoctor.status).toBe(200);
    expect(mondaySlotAt(await busyDoctor.json(), "10:00")).toBe("taken");

    const freeDoctor = await GET(request(`?week=${WEEK}&practitioner=${DOCTOR_B}`, { authorization: `Bearer ${TOKEN}` }));
    expect(mondaySlotAt(await freeDoctor.json(), "10:00")).toBe("free");
  });

  it("treats a blank practitioner param as any doctor", async () => {
    const response = await GET(request(`?week=${WEEK}&practitioner=`, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(200);
    expect(mondaySlotAt(await response.json(), "10:00")).toBe("free");
  });
});

describe("OPTIONS /api/site/availability", () => {
  it("answers a bare preflight with CORS headers", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Vary")).toBe("Authorization");
  });
});
