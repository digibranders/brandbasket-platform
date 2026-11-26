import { describe, expect, it } from "vitest";
import { channelLinkUpdateEmail } from "./channel-link-update";

const base = { to: "asha@om.test", name: "Asha", handle: "acme_foods", socialUrl: "https://app.example.test/social/review" } as const;

describe("channelLinkUpdateEmail", () => {
  it.each(["instagram", "facebook"] as const)("tells her we got the %s link and that she has nothing to do yet", (network) => {
    const message = channelLinkUpdateEmail({ ...base, network, update: "received" });
    expect(message.template).toBe("channel-link-received");
    expect(message.subject).toBe(`We got your ${network === "instagram" ? "Instagram" : "Facebook"} link`);
    expect(message.bodyText).toContain("We will email you as soon as it is your turn");
    expect(message.bodyText).toContain(network === "instagram" ? "@acme_foods" : "acme_foods");
  });

  it("numbers the steps she follows when she is invited, and links to the Social media page", () => {
    const message = channelLinkUpdateEmail({ ...base, network: "instagram", update: "invited", steps: ["Accept the invite.", "Press Allow Instagram.", "Press Allow on Meta."] });
    expect(message.subject).toBe("Your Instagram is ready to connect");
    expect(message.bodyText).toContain("1. Accept the invite.");
    expect(message.bodyText).toContain("3. Press Allow on Meta.");
    expect(message.bodyText).toContain("https://app.example.test/social/review");
  });

  it("gives the team's reason when it could not set the account up", () => {
    const message = channelLinkUpdateEmail({ ...base, network: "facebook", update: "refused", reason: "This is a personal profile." });
    expect(message.subject).toBe("We could not set up your Facebook");
    expect(message.bodyText).toContain("This is a personal profile.");
    expect(message.bodyText).toContain("send it again");
  });

  it("says the account is connected", () => {
    expect(channelLinkUpdateEmail({ ...base, network: "instagram", update: "connected" }).bodyText).toContain("@acme_foods is connected");
  });

  it("refuses an address that is not a web address and cannot be turned into a header attack", () => {
    expect(() => channelLinkUpdateEmail({ ...base, network: "instagram", update: "received", socialUrl: "javascript:1" })).toThrow();
    expect(channelLinkUpdateEmail({ ...base, name: "A\r\nBcc: x", network: "instagram", update: "received" }).subject).not.toMatch(/[\r\n]/);
  });
});
