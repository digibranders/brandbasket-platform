import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingOtpOutcome } from "./booking-otp";
import { handleBookingOtpRequest, type BookingOtpIntakeDeps } from "./booking-otp-intake";
import { SITE_UNAUTHORIZED_MESSAGE } from "./site-cors";
import type { SiteApiTenant } from "./site-api";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const URL = "http://app.localhost:3001/api/site/bookings/otp";
const TENANT: SiteApiTenant = { businessId: "11111111-1111-1111-1111-111111111111", name: "Smile Dental" };
const NOW = new Date("2026-01-05T12:00:00Z");

const FIELDS = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: "98765 43210",
  serviceId: "",
  date: "2026-01-07",
  start: "09:00",
  website: "",
};

let requested: { businessId: string; input: unknown; clientIp: string; now: Date }[];
let outcome: BookingOtpOutcome;

function deps(overrides: Partial<BookingOtpIntakeDeps> = {}): BookingOtpIntakeDeps {
  return {
    findTenant: async (token) => (token === TOKEN ? TENANT : null),
    requestOtp: async (businessId, input, clientIp, now) => {
      requested.push({ businessId, input, clientIp, now });
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
  requested = [];
  outcome = { kind: "otp_sent", otpId: "otp-1", expiresInSeconds: 600, emailHint: "a•••@example.com" };
});

describe("handleBookingOtpRequest", () => {
  it("only accepts POST", async () => {
    const response = await handleBookingOtpRequest(new Request(URL, { method: "GET" }), deps());
    expect(response.status).toBe(405);
    expect(requested).toHaveLength(0);
  });

  it("refuses a request with no bearer token, with site-cors's own unauthorized message", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: FIELDS, clientIp: "203.0.113.9" }),
    });
    const response = await handleBookingOtpRequest(request, deps());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: SITE_UNAUTHORIZED_MESSAGE });
    expect(requested).toHaveLength(0);
  });

  it("refuses a request with an unknown bearer token", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: FIELDS, clientIp: "203.0.113.9" }, { authorization: `Bearer ${"x".repeat(40)}` }),
      deps(),
    );
    expect(response.status).toBe(401);
    expect(requested).toHaveLength(0);
  });

  it("returns 500 code failed, without a 401, when findTenant itself fails", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: FIELDS, clientIp: "203.0.113.9" }),
      deps({
        findTenant: async () => {
          throw new Error("Payload connection reset");
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: "error", code: "failed" });
    expect(requested).toHaveLength(0);
  });

  it("only accepts JSON", async () => {
    const response = await handleBookingOtpRequest(post("fields=x", { "content-type": "text/plain" }), deps());
    expect(response.status).toBe(415);
    expect(requested).toHaveLength(0);
  });

  it("refuses an oversized body without reading all of it", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: { ...FIELDS, name: "x".repeat(1900) }, clientIp: "1.2.3.4", padding: "y".repeat(20_000) }),
      deps(),
    );
    expect(response.status).toBe(413);
    expect(requested).toHaveLength(0);
  });

  it("refuses a body that isn't valid JSON", async () => {
    const response = await handleBookingOtpRequest(post("{not json"), deps());
    expect(response.status).toBe(400);
    expect(requested).toHaveLength(0);
  });

  it("refuses a body that isn't the agreed shape", async () => {
    for (const body of [{ fields: { name: "x" }, clientIp: "1.2.3.4" }, { fields: FIELDS }]) {
      const response = await handleBookingOtpRequest(post(body), deps());
      expect(response.status).toBe(400);
    }
    expect(requested).toHaveLength(0);
  });

  it("answers a fake otp_sent for a filled honeypot, but requests nothing", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: { ...FIELDS, website: "http://spam.example" }, clientIp: "1.2.3.4" }),
      deps(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("otp_sent");
    expect(typeof body.otpId).toBe("string");
    expect(body.otpId.length).toBeGreaterThan(10);
    expect(body.expiresInSeconds).toBe(600);
    expect(body.emailHint).toBe("a•••@example.com");
    expect(body).not.toHaveProperty("phoneHint");
    expect(requested).toHaveLength(0);
  });

  it("answers the honeypot's fake hint from the address the bot sent, and a plausible one when it sent none", async () => {
    const fake = (fields: Record<string, unknown>) =>
      handleBookingOtpRequest(post({ fields: { ...FIELDS, website: "spam", ...fields }, clientIp: "1.2.3.4" }), deps()).then((response) => response.json());
    expect((await fake({ email: "Bot@Spam.example" })).emailHint).toBe("b•••@spam.example");
    expect((await fake({ email: undefined })).emailHint).toBe("•••");
  });

  it("gives the honeypot response a different random id on each call", async () => {
    const bodyReq = { fields: { ...FIELDS, website: "spam" }, clientIp: "1.2.3.4" };
    const first = await (await handleBookingOtpRequest(post(bodyReq), deps())).json();
    const second = await (await handleBookingOtpRequest(post(bodyReq), deps())).json();
    expect(first.otpId).not.toBe(second.otpId);
  });

  it("returns 422 with the field name on an invalid phone", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: { ...FIELDS, phone: "x" }, clientIp: "1.2.3.4" }),
      deps(),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "phone" });
    expect(requested).toHaveLength(0);
  });

  it("returns 422 on email, naming the field, when the address is missing or is not one", async () => {
    const withoutEmail = Object.fromEntries(Object.entries(FIELDS).filter(([key]) => key !== "email"));
    for (const fields of [withoutEmail, { ...FIELDS, email: "" }, { ...FIELDS, email: "asha" }]) {
      const response = await handleBookingOtpRequest(post({ fields, clientIp: "1.2.3.4" }), deps());
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "email" });
    }
    expect(requested).toHaveLength(0);
  });

  it("passes the address, lowercased, and the phone number on to requestOtp", async () => {
    await handleBookingOtpRequest(post({ fields: { ...FIELDS, email: " Asha@Example.COM " }, clientIp: "1.2.3.4" }), deps());
    expect(requested[0]?.input).toMatchObject({ email: "asha@example.com", phone: "+919876543210" });
  });

  it("passes the chosen doctor through to requestOtp, and a missing one as any doctor (null)", async () => {
    const doctorId = "01923a4e-7b3a-7c3e-8f3a-1234567890ab";
    await handleBookingOtpRequest(post({ fields: { ...FIELDS, practitionerId: doctorId }, clientIp: "1.2.3.4" }), deps());
    await handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps());
    expect(requested.map((call) => call.input)).toMatchObject([{ practitionerId: doctorId }, { practitionerId: null }]);
  });

  it("returns 422 on practitionerId when it is not a uuid, without requesting an OTP", async () => {
    const response = await handleBookingOtpRequest(post({ fields: { ...FIELDS, practitionerId: "dr-a" }, clientIp: "1.2.3.4" }), deps());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "practitionerId" });
    expect(requested).toHaveLength(0);
  });

  it("passes the tenant's business id and the body's own clientIp to requestOtp", async () => {
    const response = await handleBookingOtpRequest(
      post({ fields: FIELDS, clientIp: "203.0.113.9", businessId: "someone-elses-business" }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(requested).toHaveLength(1);
    expect(requested[0]?.businessId).toBe(TENANT.businessId);
    expect(requested[0]?.clientIp).toBe("203.0.113.9");
    expect(requested[0]?.now).toBe(NOW);
    expect(requested[0]?.input).toMatchObject({ name: "Asha Rao", date: "2026-01-07", start: "09:00" });
  });

  it.each<[BookingOtpOutcome, number, Record<string, unknown>]>([
    [{ kind: "otp_sent", otpId: "otp-1", expiresInSeconds: 600, emailHint: "a•••@example.com" }, 200, { status: "otp_sent", otpId: "otp-1" }],
    [{ kind: "unavailable" }, 403, { status: "error", code: "unavailable" }],
    [{ kind: "paused", message: "Back on Monday" }, 409, { status: "error", code: "paused", message: "Back on Monday" }],
    [{ kind: "invalid", field: "start", message: "Choose an available time." }, 422, { status: "error", code: "invalid", field: "start" }],
    [{ kind: "taken" }, 409, { status: "error", code: "taken" }],
    [{ kind: "limited" }, 429, { status: "error", code: "limited" }],
    [{ kind: "failed" }, 500, { status: "error", code: "failed" }],
  ])("maps the %o outcome onto the right response", async (given, status, body) => {
    outcome = given;
    const response = await handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject(body);
  });

  it("never sets an Access-Control-Allow-Origin header, since this endpoint is server-to-server only", async () => {
    const responses = await Promise.all([
      handleBookingOtpRequest(new Request(URL, { method: "GET" }), deps()),
      handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }, { authorization: "Bearer wrong" }), deps()),
      handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps()),
    ]);
    for (const response of responses) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("always answers Cache-Control: no-store, success or failure alike", async () => {
    const responses = await Promise.all([
      handleBookingOtpRequest(new Request(URL, { method: "GET" }), deps()), // 405
      handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }, { authorization: "Bearer wrong" }), deps()), // 401
      handleBookingOtpRequest(
        post({ fields: FIELDS, clientIp: "1.2.3.4" }),
        deps({
          findTenant: async () => {
            throw new Error("broken");
          },
        }),
      ), // 500 (findTenant)
      handleBookingOtpRequest(post("{not json", {}), deps()), // 400
      handleBookingOtpRequest(post({ fields: { ...FIELDS, website: "spam" }, clientIp: "1.2.3.4" }), deps()), // 200, honeypot
      handleBookingOtpRequest(post({ fields: { ...FIELDS, phone: "x" }, clientIp: "1.2.3.4" }), deps()), // 422
      handleBookingOtpRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps()), // 200, otp_sent
    ]);
    for (const response of responses) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
