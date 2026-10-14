import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadInput } from "@fynix/shared/lib/lead-form";
import { handleLeadRequest, type LeadIntakeDeps, type LeadRecordOutcome } from "./lead-intake";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const URL = "http://app.localhost:3001/api/leads";

const FIELDS = {
  name: "Asha Rao",
  businessName: "Smile Dental",
  email: "Asha@Example.com",
  phone: "98765 43210",
  phoneCountry: "IN",
  businessType: "clinic",
  message: "",
  website: "",
};

let recorded: { input: LeadInput; clientIp: string; noticeVersion: string | null }[];
let outcome: LeadRecordOutcome;

function deps(overrides: Partial<LeadIntakeDeps> = {}): LeadIntakeDeps {
  return {
    token: TOKEN,
    record: async (input, clientIp, noticeVersion) => {
      recorded.push({ input, clientIp, noticeVersion });
      return outcome;
    },
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
  recorded = [];
  outcome = "recorded";
});

describe("handleLeadRequest", () => {
  it("records a valid enquiry with the visitor's address and answers sent", async () => {
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "203.0.113.9" }), deps());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent", name: "Asha Rao", email: "asha@example.com" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.clientIp).toBe("203.0.113.9");
    expect(recorded[0]?.input).toMatchObject({ businessName: "Smile Dental", phone: "+919876543210" });
  });

  it("hands on the notice version the visitor saw, so it can be kept as proof", async () => {
    await handleLeadRequest(post({ fields: FIELDS, clientIp: "203.0.113.9", noticeVersion: "pre-dpdp" }), deps());
    expect(recorded[0]?.noticeVersion).toBe("pre-dpdp");
  });

  it("still takes an enquiry from a website that does not send the version yet", async () => {
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "203.0.113.9" }), deps());
    expect(response.status).toBe(200);
    expect(recorded[0]?.noticeVersion).toBeNull();
  });

  it.each([["an empty one", ""], ["one too long to be a label", "v".repeat(41)]])("refuses %s as a notice version", async (_label, noticeVersion) => {
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "203.0.113.9", noticeVersion }), deps());
    expect(response.status).toBe(400);
    expect(recorded).toHaveLength(0);
  });

  it.each([
    ["no header", {}],
    ["the wrong token", { authorization: `Bearer ${"x".repeat(40)}` }],
    ["a different scheme", { authorization: `Basic ${TOKEN}` }],
  ])("refuses a request with %s", async (_label, headers) => {
    const request = new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ fields: FIELDS, clientIp: "203.0.113.9" }),
    });
    const response = await handleLeadRequest(request, deps());
    expect(response.status).toBe(401);
    expect(recorded).toHaveLength(0);
  });

  it("is unavailable, not open, when no token is configured", async () => {
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "x" }), deps({ token: null }));
    expect(response.status).toBe(503);
    expect(recorded).toHaveLength(0);
  });

  it("only accepts JSON posts", async () => {
    const get = await handleLeadRequest(new Request(URL, { method: "GET" }), deps());
    expect(get.status).toBe(405);
    const text = await handleLeadRequest(post("name=x", { "content-type": "text/plain" }), deps());
    expect(text.status).toBe(415);
  });

  it("refuses a body that isn't the agreed shape", async () => {
    for (const body of ["{not json", { fields: { name: "x" }, clientIp: "1.2.3.4" }, { fields: FIELDS }]) {
      const response = await handleLeadRequest(post(body), deps());
      expect(response.status).toBe(400);
    }
    expect(recorded).toHaveLength(0);
  });

  it("refuses an oversized body without reading all of it", async () => {
    const response = await handleLeadRequest(
      post({ fields: { ...FIELDS, message: "x".repeat(1900) }, clientIp: "1.2.3.4", padding: "y".repeat(20_000) }),
      deps(),
    );
    expect(response.status).toBe(413);
  });

  it("returns the form's own message and field for invalid details", async () => {
    const response = await handleLeadRequest(post({ fields: { ...FIELDS, email: "nope" }, clientIp: "1.2.3.4" }), deps());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "error", field: "email" });
    expect(recorded).toHaveLength(0);
  });

  it("answers a filled honeypot exactly like a real enquiry, but records nothing", async () => {
    const response = await handleLeadRequest(
      post({ fields: { ...FIELDS, website: "http://spam.example" }, clientIp: "1.2.3.4" }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "sent" });
    expect(recorded).toHaveLength(0);
  });

  it("passes on a rate limit as 429", async () => {
    outcome = "limited";
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ status: "error", field: null });
  });

  it("reports a failure to record as 500 with a message the visitor can act on", async () => {
    outcome = "failed";
    const response = await handleLeadRequest(post({ fields: FIELDS, clientIp: "1.2.3.4" }), deps());
    expect(response.status).toBe(500);
    const body = (await response.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/email us/);
  });
});
