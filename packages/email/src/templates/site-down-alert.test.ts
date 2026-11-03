import { describe, expect, it } from "vitest";
import { siteDownAlertEmail } from "./site-down-alert";

const input = {
  to: "support@brandbasket.in",
  businessName: "Kavya Salon",
  url: "https://kavyasalon.in/",
  downSince: "3 November 2026, 14:20 IST",
  lastResult: "HTTP 503",
  clientUrl: "https://console.brandbasket.in/clients/0192f3c4-1111-7000-8000-000000000001",
};

describe("siteDownAlertEmail", () => {
  it("names the business, the address and what the checks saw, and links to the client", () => {
    const message = siteDownAlertEmail(input);
    expect(message.template).toBe("site-down-alert");
    expect(message.subject).toBe("Website down: Kavya Salon");
    expect(message.bodyText).toContain("https://kavyasalon.in/");
    expect(message.bodyText).toContain("HTTP 503");
    expect(message.bodyHtml).toContain(`href="${input.clientUrl}"`);
  });

  it("escapes the business name and keeps line breaks out of the subject", () => {
    const message = siteDownAlertEmail({ ...input, businessName: "<b>Kavya</b>\nBcc: x" });
    expect(message.bodyHtml).not.toContain("<b>Kavya</b>");
    expect(message.subject).not.toContain("\n");
  });

  it("refuses a console link that is not http or https", () => {
    expect(() => siteDownAlertEmail({ ...input, clientUrl: "javascript:alert(1)" })).toThrow(/http or https/);
  });
});
