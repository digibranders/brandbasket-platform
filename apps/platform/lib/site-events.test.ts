import { describe, expect, it } from "vitest";
import { SITE_EVENT_BODY_LIMIT, parseSiteEventBody, websiteEnquiriesLine, type WebsiteEnquiries } from "@/lib/site-events";

describe("parseSiteEventBody", () => {
  it("accepts the three kinds", () => {
    for (const kind of ["call", "whatsapp", "form"] as const) {
      expect(parseSiteEventBody(JSON.stringify({ kind }))).toEqual({ ok: true, kind });
    }
  });

  it("rejects anything else", () => {
    for (const text of [
      '{"kind":"chatbot"}',
      '{"kind":"Call"}',
      '{"kind":1}',
      '{"kind":"call","extra":true}',
      "{}",
      '["call"]',
      '[{"kind":"call"}]',
      '"call"',
      "null",
      "42",
      "{not json",
      "",
    ]) {
      expect(parseSiteEventBody(text)).toEqual({ ok: false });
    }
  });

  it("limits the body to 256 bytes", () => {
    expect(SITE_EVENT_BODY_LIMIT).toBe(256);
  });
});

describe("websiteEnquiriesLine", () => {
  const counts = (overrides: Partial<WebsiteEnquiries> = {}): WebsiteEnquiries => ({ call: 0, whatsapp: 0, form: 0, chatbot: 0, previous: 0, ...overrides });

  it("is null when there are no site events, so the chatbot line stays", () => {
    expect(websiteEnquiriesLine(counts())).toBeNull();
    expect(websiteEnquiriesLine(counts({ chatbot: 9, previous: 4 }))).toBeNull();
  });

  it("uses the singular headline for one and the plural otherwise", () => {
    expect(websiteEnquiriesLine(counts({ form: 1 }))).toEqual({ figure: "1", headline: "person contacted you from your website", detail: "1 form" });
    expect(websiteEnquiriesLine(counts({ form: 2 }))?.headline).toBe("people contacted you from your website");
  });

  it("lists the non-zero parts in the order calls, WhatsApp, forms, chatbot", () => {
    expect(websiteEnquiriesLine(counts({ call: 21, whatsapp: 11, form: 6 }))).toEqual({
      figure: "38",
      headline: "people contacted you from your website",
      detail: "21 calls, 11 WhatsApp, 6 forms",
    });
    expect(websiteEnquiriesLine(counts({ call: 1, chatbot: 3 }))?.detail).toBe("1 call, 3 chatbot");
    expect(websiteEnquiriesLine(counts({ whatsapp: 5, form: 1, chatbot: 2 }))?.detail).toBe("5 WhatsApp, 1 form, 2 chatbot");
    expect(websiteEnquiriesLine(counts({ call: 4 }))?.detail).toBe("4 calls");
  });

  it("says up from, down from, or nothing when last month was equal or zero", () => {
    const base = { call: 21, whatsapp: 11, form: 6 };
    expect(websiteEnquiriesLine(counts({ ...base, previous: 32 }))?.detail).toBe("21 calls, 11 WhatsApp, 6 forms, up from 32");
    expect(websiteEnquiriesLine(counts({ ...base, previous: 40 }))?.detail).toBe("21 calls, 11 WhatsApp, 6 forms, down from 40");
    expect(websiteEnquiriesLine(counts({ ...base, previous: 38 }))?.detail).toBe("21 calls, 11 WhatsApp, 6 forms");
    expect(websiteEnquiriesLine(counts({ ...base, previous: 0 }))?.detail).toBe("21 calls, 11 WhatsApp, 6 forms");
  });
});
