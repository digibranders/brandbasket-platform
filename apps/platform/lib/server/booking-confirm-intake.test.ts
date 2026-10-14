import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingConfirmOutcome } from "./booking-confirm";
import { handleBookingConfirmRequest, type BookingConfirmIntakeDeps } from "./booking-confirm-intake";
import { SITE_UNAUTHORIZED_MESSAGE } from "./site-cors";
import type { SiteApiTenant } from "./site-api";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const URL = "http://app.localhost:3001/api/site/bookings/confirm";
const TENANT: SiteApiTenant = { businessId: "11111111-1111-1111-1111-111111111111", name: "Smile Dental" };
const NOW = new Date("2026-01-05T12:00:00Z");

const BODY = { otpId: "22222222-2222-2222-2222-222222222222", code: "482913", clientIp: "203.0.113.9" };

let confirmed: { businessId: string; otpId: string; code: string; clientIp: string; now: Date }[];
let outcome: BookingConfirmOutcome;

function deps(overrides: Partial<BookingConfirmIntakeDeps> = {}): BookingConfirmIntakeDeps {
  return {
    findTenant: async (token) => (token === TOKEN ? TENANT : null),
    confirmOtp: async (businessId, otpId, code, clientIp, now) => {
      confirmed.push({ businessId, otpId, code, clientIp, now });
      return outcome;
    },
    now: () => NOW,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  confirmed = [];
  outcome = { kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Asha Rao" };
});

describe("handleBookingConfirmRequest", () => {
  it("only accepts POST", async () => {
    const response = await handleBookingConfirmRequest(new Request(URL, { method: "GET" }), deps());
    expect(response.status).toBe(405);
    expect(confirmed).toHaveLength(0);
  });

  it("refuses a request with no bearer token", async () => {
    const request = new Request(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(BODY) });
    const response = await handleBookingConfirmRequest(request, deps());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: SITE_UNAUTHORIZED_MESSAGE });
    expect(confirmed).toHaveLength(0);
  });

  it("refuses a request with an unknown bearer token", async () => {
    const response = await handleBookingConfirmRequest(post(BODY, { authorization: `Bearer ${"x".repeat(40)}` }), deps());
    expect(response.status).toBe(401);
    expect(confirmed).toHaveLength(0);
  });

  it("returns 500 code failed, without a 401, when findTenant itself fails", async () => {
    const response = await handleBookingConfirmRequest(
      post(BODY),
      deps({
        findTenant: async () => {
          throw new Error("Payload connection reset");
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: "error", code: "failed" });
    expect(confirmed).toHaveLength(0);
  });

  it("only accepts JSON", async () => {
    const response = await handleBookingConfirmRequest(post("otpId=x", { "content-type": "text/plain" }), deps());
    expect(response.status).toBe(415);
    expect(confirmed).toHaveLength(0);
  });

  it("refuses an oversized body without reading all of it", async () => {
    const response = await handleBookingConfirmRequest(post({ ...BODY, padding: "y".repeat(20_000) }), deps());
    expect(response.status).toBe(413);
    expect(confirmed).toHaveLength(0);
  });

  it("refuses a body that isn't valid JSON", async () => {
    const response = await handleBookingConfirmRequest(post("{not json"), deps());
    expect(response.status).toBe(400);
    expect(confirmed).toHaveLength(0);
  });

  it("refuses a body that isn't the agreed shape", async () => {
    for (const body of [{ otpId: "x" }, { code: "482913", clientIp: "1.2.3.4" }]) {
      const response = await handleBookingConfirmRequest(post(body), deps());
      expect(response.status).toBe(400);
    }
    expect(confirmed).toHaveLength(0);
  });

  it.each(["1234", "1234567", "12345a", ""])("refuses a code that isn't 6 digits: %s", async (code) => {
    const response = await handleBookingConfirmRequest(post({ ...BODY, code }), deps());
    expect(response.status).toBe(400);
    expect(confirmed).toHaveLength(0);
  });

  it("passes the tenant's business id and the body's otpId/code/clientIp to confirmOtp", async () => {
    const response = await handleBookingConfirmRequest(post(BODY), deps());
    expect(response.status).toBe(200);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toEqual({ businessId: TENANT.businessId, otpId: BODY.otpId, code: BODY.code, clientIp: BODY.clientIp, now: NOW });
  });

  it.each<[BookingConfirmOutcome, number, Record<string, unknown>]>([
    [{ kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Asha Rao" }, 200, { status: "booked", date: "2026-01-05", practitionerName: "Dr. Asha Rao" }],
    [{ kind: "expired" }, 410, { status: "error", code: "expired" }],
    [{ kind: "too_many_attempts", message: "No tries left. Send a new code." }, 429, { status: "error", code: "too_many_attempts" }],
    [{ kind: "wrong_code", message: "That code isn't right. 3 tries left." }, 422, { status: "error", code: "wrong_code", field: "code" }],
    [{ kind: "taken", message: "Someone just booked that slot. Please pick another." }, 409, { status: "error", code: "taken", message: "Someone just booked that slot. Please pick another." }],
    [{ kind: "taken", message: "That time has passed. Please pick another slot." }, 409, { status: "error", code: "taken", message: "That time has passed. Please pick another slot." }],
    [{ kind: "taken", message: "That time is no longer available. Please pick another slot." }, 409, { status: "error", code: "taken", message: "That time is no longer available. Please pick another slot." }],
    [{ kind: "unavailable" }, 403, { status: "error", code: "unavailable" }],
    [{ kind: "paused", message: "Back on Monday" }, 409, { status: "error", code: "paused", message: "Back on Monday" }],
    [{ kind: "limited" }, 429, { status: "error", code: "limited" }],
    [{ kind: "failed" }, 500, { status: "error", code: "failed" }],
  ])("maps the %o outcome onto the right response", async (given, status, body) => {
    outcome = given;
    const response = await handleBookingConfirmRequest(post(BODY), deps());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject(body);
  });

  it("accepts a booked response whose end is '24:00'", async () => {
    outcome = { kind: "booked", date: "2026-01-05", start: "23:30", end: "24:00", practitionerName: null };
    const response = await handleBookingConfirmRequest(post(BODY), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "booked", date: "2026-01-05", start: "23:30", end: "24:00", practitionerName: null });
  });

  it("never sets an Access-Control-Allow-Origin header, since this endpoint is server-to-server only", async () => {
    const responses = await Promise.all([
      handleBookingConfirmRequest(new Request(URL, { method: "GET" }), deps()),
      handleBookingConfirmRequest(post(BODY, { authorization: "Bearer wrong" }), deps()),
      handleBookingConfirmRequest(post(BODY), deps()),
    ]);
    for (const response of responses) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("always answers Cache-Control: no-store, success or failure alike", async () => {
    const responses = await Promise.all([
      handleBookingConfirmRequest(new Request(URL, { method: "GET" }), deps()), // 405
      handleBookingConfirmRequest(post(BODY, { authorization: "Bearer wrong" }), deps()), // 401
      handleBookingConfirmRequest(
        post(BODY),
        deps({
          findTenant: async () => {
            throw new Error("broken");
          },
        }),
      ), // 500
      handleBookingConfirmRequest(post("{not json", {}), deps()), // 400
      handleBookingConfirmRequest(post(BODY), deps()), // 200
    ]);
    for (const response of responses) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
