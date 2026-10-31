import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildGa4Purchase, buildGa4SignUp } from "./ga4";
import { buildMetaPurchase, sha256Lower } from "./meta";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const PAID_AT = new Date("2026-11-01T10:00:00Z");

describe("buildGa4Purchase", () => {
  const input = {
    clientId: "123.456",
    sessionId: "1700000001",
    transactionId: "pay_Abc123",
    valueCents: 254154,
    currency: "INR" as const,
    paidAt: PAID_AT,
    now: new Date("2026-11-01T10:05:00Z"),
    campaign: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "diwali", utm_term: "set2", utm_content: "ad1" },
  };

  it("is a purchase with a transaction id, a value in rupees and the campaign", () => {
    const body = buildGa4Purchase(input);
    expect(body.client_id).toBe("123.456");
    expect(body.timestamp_micros).toBe(String(PAID_AT.getTime() * 1000));
    expect(body.events).toEqual([
      {
        name: "purchase",
        params: {
          transaction_id: "pay_Abc123",
          value: 2541.54,
          currency: "INR",
          items: [{ item_id: "first-payment", item_name: "Brandbasket first payment", price: 2541.54, quantity: 1 }],
          session_id: "1700000001",
          engagement_time_msec: 1,
          source: "meta",
          medium: "paid_social",
          campaign: "diwali",
          term: "set2",
          content: "ad1",
        },
      },
    ]);
  });

  it("leaves out what it does not have, and the timestamp once it is too old for Google to take", () => {
    const body = buildGa4Purchase({ ...input, sessionId: null, campaign: { utm_source: "google" }, now: new Date("2026-11-05T10:00:00Z") });
    expect(body).not.toHaveProperty("timestamp_micros");
    expect(body.events[0]?.params).not.toHaveProperty("session_id");
    expect(body.events[0]?.params).not.toHaveProperty("medium");
    expect(body.events[0]?.params).toMatchObject({ source: "google" });
  });
});

describe("buildGa4SignUp", () => {
  it("is a sign_up by email on the visitor's own client and session, with the campaign", () => {
    expect(buildGa4SignUp({ clientId: "123.456", sessionId: "1700000001", campaign: { utm_source: "meta", utm_medium: "paid_social" } })).toEqual({
      client_id: "123.456",
      events: [{ name: "sign_up", params: { method: "email", engagement_time_msec: 1, session_id: "1700000001", source: "meta", medium: "paid_social" } }],
    });
  });

  it("leaves out the session when there is none", () => {
    expect(buildGa4SignUp({ clientId: "1.2", sessionId: null, campaign: {} }).events[0].params).toEqual({ method: "email", engagement_time_msec: 1 });
  });
});

describe("sha256Lower", () => {
  it("hashes the trimmed, lower-case text", () => {
    expect(sha256Lower("  Rahul@Mehta.IN ")).toBe(sha("rahul@mehta.in"));
  });
});

describe("buildMetaPurchase", () => {
  const input = {
    eventId: "pay_Abc123",
    paidAt: PAID_AT,
    sourceUrl: "https://app.brandbasket.in/",
    email: "Rahul@Mehta.in",
    phone: "+91 98765-43210",
    fbp: "fb.1.1.2",
    fbc: "fb.1.1.IwAR0",
    valueCents: 254154,
    currency: "INR" as const,
  };

  it("is a website purchase, deduped on the payment id, with hashed contact details and the browser ids", () => {
    expect(buildMetaPurchase(input)).toEqual({
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(PAID_AT.getTime() / 1000),
          event_id: "pay_Abc123",
          action_source: "website",
          event_source_url: "https://app.brandbasket.in/",
          user_data: { em: [sha("rahul@mehta.in")], ph: [sha("919876543210")], fbp: "fb.1.1.2", fbc: "fb.1.1.IwAR0" },
          custom_data: { currency: "INR", value: 2541.54 },
        },
      ],
    });
  });

  it("sends only the details it has", () => {
    const body = buildMetaPurchase({ ...input, email: null, phone: null, fbp: null, fbc: null });
    expect(body.data[0]?.user_data).toEqual({});
  });
});
