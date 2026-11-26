import { describe, expect, it } from "vitest";
import { channelLinkRequestedEmail } from "./channel-link-requested";

const input = { to: "steve@fynix.digital", businessName: "Acme Foods", network: "instagram", profileUrl: "https://instagram.com/acme_foods", handle: "acme_foods", requesterName: "Asha", requesterEmail: "asha@acme.test", adminUrl: "https://admin.example.test/clients" } as const;

describe("channelLinkRequestedEmail", () => {
  it("tells the team whose profile to set up and where to answer", () => {
    const message = channelLinkRequestedEmail(input);
    expect(message.to).toBe("steve@fynix.digital");
    expect(message.subject).toBe("Instagram link from Acme Foods");
    expect(message.bodyText).toContain("Link: https://instagram.com/acme_foods");
    expect(message.bodyText).toContain("Sent by: Asha (asha@acme.test)");
    expect(message.bodyHtml).toContain("acme_foods");
  });

  it("shows the person to add as the tester when the network asks for one", () => {
    const message = channelLinkRequestedEmail({ ...input, adminProfileUrl: "https://www.facebook.com/asha.mehta" });
    expect(message.bodyText).toContain("Add this person as the tester: https://www.facebook.com/asha.mehta");
    expect(channelLinkRequestedEmail(input).bodyText).not.toContain("tester:");
  });

  it("cannot be turned into a header attack through a name", () => {
    expect(channelLinkRequestedEmail({ ...input, businessName: "Acme\r\nBcc: x@y.test" }).subject).not.toMatch(/[\r\n]/);
  });

  it("refuses a link that is not a web address", () => {
    expect(() => channelLinkRequestedEmail({ ...input, profileUrl: "javascript:alert(1)" })).toThrow();
  });
});
