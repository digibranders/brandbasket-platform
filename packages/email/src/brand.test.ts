import { describe, expect, it } from "vitest";
import { emailBrandName, emailSenderDefaults, emailTeamInboxDefault } from "./brand";

describe("the name a deployment's emails go out under", () => {
  it("is Brandbasket", () => {
    expect(emailBrandName()).toBe("Brandbasket");
  });
});

describe("who mail comes from by default", () => {
  it("is Brandbasket <no-reply@brandbasket.in> with replies to hello@brandbasket.in", () => {
    expect(emailSenderDefaults()).toEqual({
      from: { email: "no-reply@brandbasket.in", name: "Brandbasket" },
      replyTo: { email: "hello@brandbasket.in", name: "Brandbasket Support" },
    });
    expect(emailTeamInboxDefault()).toBe("hello@brandbasket.in");
  });
});
