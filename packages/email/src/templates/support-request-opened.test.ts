import { describe, expect, it } from "vitest";
import { supportRequestOpenedEmail } from "./support-request-opened";

const input = {
  to: "owner@kavyasalon.test",
  businessName: "Kavya Salon",
  subject: "Change the Sunday hours",
  requestUrl: "https://app.brandbasket.in/support/0192f3c4-1111-7000-8000-000000000001",
};

describe("supportRequestOpenedEmail", () => {
  it("says what was opened and links to it", () => {
    const message = supportRequestOpenedEmail(input);
    expect(message.template).toBe("support-request-opened");
    expect(message.subject).toBe("We opened a request for Kavya Salon: Change the Sunday hours");
    expect(message.bodyText).toContain(input.requestUrl);
    expect(message.bodyHtml).toContain(`href="${input.requestUrl}"`);
  });

  it("escapes what staff typed", () => {
    const message = supportRequestOpenedEmail({ ...input, subject: "<b>Hours</b>" });
    expect(message.bodyHtml).not.toContain("<b>Hours</b>");
    expect(message.bodyHtml).toContain("&lt;b&gt;Hours&lt;/b&gt;");
  });

  it("keeps line breaks out of the subject", () => {
    expect(supportRequestOpenedEmail({ ...input, subject: "Hours\nBcc: someone" }).subject).not.toContain("\n");
  });

  it("refuses a link that is not http or https", () => {
    expect(() => supportRequestOpenedEmail({ ...input, requestUrl: "javascript:alert(1)" })).toThrow(/http or https/);
  });
});
