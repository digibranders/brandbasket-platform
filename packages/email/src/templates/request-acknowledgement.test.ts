import { describe, expect, it } from "vitest";
import { requestAcknowledgementEmail, type RequestAcknowledgementInput } from "./request-acknowledgement";

const BASE: RequestAcknowledgementInput = {
  to: "priya@example.com",
  name: "Priya Shah",
  title: "Add an Implants page",
  requestUrl: "https://app.brandbasket.in/requests/0192f3c4-0000-7000-8000-000000000001",
  businessName: "Riverside Plumbing",
};

describe("requestAcknowledgementEmail", () => {
  it("confirms a request was received with customer name, title, and link", () => {
    const email = requestAcknowledgementEmail(BASE);
    expect(email.to).toBe("priya@example.com");
    expect(email.subject).toBe("We received your request: Add an Implants page");
    expect(email.template).toBe("request-acknowledgement");

    expect(email.bodyText).toContain("Hi Priya,");
    expect(email.bodyText).toContain('We have your request for Riverside Plumbing: "Add an Implants page".');
    expect(email.bodyText).toContain("Our team will review it and reply soon.");
    expect(email.bodyText).toContain("Open your request: https://app.brandbasket.in/requests/0192f3c4-0000-7000-8000-000000000001");
    expect(email.bodyText).toContain("The Brandbasket team");

    expect(email.bodyHtml).toContain("Hi Priya,");
    expect(email.bodyHtml).toContain('We have your request for Riverside Plumbing: &quot;Add an Implants page&quot;.');
    expect(email.bodyHtml).toContain('href="https://app.brandbasket.in/requests/0192f3c4-0000-7000-8000-000000000001"');
    expect(email.bodyHtml).toContain(">Open your request</a>");
  });

  it("handles a request without a customer name or business name", () => {
    const email = requestAcknowledgementEmail({
      to: "customer@example.com",
      name: null,
      title: "Question about invoice",
      requestUrl: "https://app.brandbasket.in/requests/0192f3c4-0000-7000-8000-000000000002",
    });
    expect(email.subject).toBe("We received your request: Question about invoice");
    expect(email.bodyText).toContain("Hello,");
    expect(email.bodyText).toContain('We have your request: "Question about invoice".');
  });

  it("never contains em or en dashes in any customer-facing text", () => {
    const email = requestAcknowledgementEmail(BASE);
    expect(email.subject).not.toMatch(/[—–]/);
    expect(email.bodyText).not.toMatch(/[—–]/);
    expect(email.bodyHtml).not.toMatch(/[—–]/);
  });

  it("sanitizes header values and strips newlines", () => {
    const email = requestAcknowledgementEmail({
      ...BASE,
      to: "priya@example.com\r\nBcc: evil@example.com",
      title: "Add page\nwith newline",
    });
    expect(email.to).toBe("priya@example.com Bcc: evil@example.com");
    expect(email.subject).toBe("We received your request: Add page with newline");
  });

  it("refuses an invalid request URL", () => {
    expect(() => requestAcknowledgementEmail({ ...BASE, requestUrl: "javascript:alert(1)" })).toThrow();
    expect(() => requestAcknowledgementEmail({ ...BASE, requestUrl: "not-a-url" })).toThrow();
  });
});
