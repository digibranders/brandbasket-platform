import type { Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, stripQuery } from "./sentry-scrub";

describe("stripQuery", () => {
  it("cuts the query and fragment and leaves the path", () => {
    expect(stripQuery("https://app.firstfold.io/billing?invoice=INV-1&email=a@b.com#top")).toBe("https://app.firstfold.io/billing");
    expect(stripQuery("/support/abc")).toBe("/support/abc");
  });
});

describe("scrubEvent", () => {
  const event: Event = {
    event_id: "e1",
    release: "abcdef1",
    level: "error",
    message: "Phone 9876543210 is not valid",
    logentry: { message: "Phone %s is not valid", params: ["9876543210"] },
    request: {
      method: "POST",
      url: "https://app.firstfold.io/app-host/billing?email=a%40b.com",
      query_string: "email=a%40b.com",
      data: { description: "My card ends 4242" },
      cookies: { session: "secret" },
      headers: { cookie: "session=secret", authorization: "Bearer x", "user-agent": "Mozilla" },
      env: { REMOTE_ADDR: "1.2.3.4" },
    },
    user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
    extra: { formValues: { name: "Asha" } },
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Cannot read properties of undefined (reading 'asha@example.com')",
          stacktrace: { frames: [{ filename: "https://app.firstfold.io/_next/static/chunk.js?v=1", lineno: 4, colno: 9, vars: { name: "Asha" } }] },
        },
      ],
    },
    breadcrumbs: [
      { category: "console", message: "Saved Asha's address" },
      { category: "ui.input", message: "input#phone" },
      { category: "ui.click", message: "button.save > span", data: { text: "Save for Asha" } },
      { category: "fetch", message: "POST /x", data: { method: "POST", url: "/api/x?token=abc", status_code: 500, request_body: "secret" } },
      { category: "navigation", data: { from: "/a?x=1", to: "/b?y=2" } },
    ],
    transaction: "/app-host/billing?tab=1",
    spans: [
      { span_id: "s", trace_id: "t", start_timestamp: 1, status: "ok", data: { "url.full": "https://x/y?z=1", "http.query": "z=1", "db.statement": "select 1", "http.response.status_code": 200 }, description: "GET https://x/y?z=1", origin: "auto" },
    ],
    contexts: { trace: { trace_id: "t", span_id: "s", data: { "http.query": "z=1", "http.route": "/billing" } } },
  };

  it("removes request bodies, query strings, cookies and headers but keeps the method and URL path", () => {
    const clean = scrubEvent(event);
    expect(clean.request).toEqual({ method: "POST", url: "https://app.firstfold.io/app-host/billing" });
    expect(JSON.stringify(clean)).not.toMatch(/secret|4242|Bearer|asha|Asha|9876543210|a%40b|token=abc|1\.2\.3\.4/);
  });

  it("keeps the exception type, stack frames, release, level and route path", () => {
    const clean = scrubEvent(event);
    expect(clean.exception?.values?.[0]?.type).toBe("TypeError");
    expect(clean.exception?.values?.[0]?.value).toBeUndefined();
    const frame = clean.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame).toMatchObject({ filename: "https://app.firstfold.io/_next/static/chunk.js", lineno: 4, colno: 9 });
    expect(frame?.vars).toBeUndefined();
    expect(clean.release).toBe("abcdef1");
    expect(clean.level).toBe("error");
    expect(clean.transaction).toBe("/app-host/billing");
  });

  it("drops console and input breadcrumbs, and every breadcrumb message", () => {
    const clean = scrubEvent(event);
    expect(clean.breadcrumbs?.map((item) => item.category)).toEqual(["ui.click", "fetch", "navigation"]);
    expect(clean.breadcrumbs?.every((item) => item.message === undefined)).toBe(true);
    expect(clean.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(clean.breadcrumbs?.[1]?.data).toEqual({ method: "POST", status_code: 500, url: "/api/x" });
    expect(clean.breadcrumbs?.[2]?.data).toEqual({ from: "/a", to: "/b" });
  });

  it("cuts queries and statements from spans and the trace context but keeps status codes", () => {
    const clean = scrubEvent(event);
    expect(clean.spans?.[0]?.description).toBe("GET https://x/y");
    expect(clean.spans?.[0]?.data).toEqual({ "url.full": "https://x/y", "http.response.status_code": 200 });
    expect(clean.contexts?.trace?.data).toEqual({ "http.route": "/billing" });
  });

  it("does not change the original event", () => {
    scrubEvent(event);
    expect(event.request?.data).toEqual({ description: "My card ends 4242" });
  });

  it("passes an event with nothing sensitive through", () => {
    expect(scrubEvent({ event_id: "e2", level: "fatal" })).toMatchObject({ event_id: "e2", level: "fatal" });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "hello" })).toBeNull();
  });
  it("keeps other breadcrumbs without a message or data", () => {
    expect(scrubBreadcrumb({ category: "ui.click", message: "button", timestamp: 1 })).toEqual({ category: "ui.click", message: undefined, data: undefined, timestamp: 1 });
  });
});
