import { describe, expect, it } from "vitest";
import { emailBrandName, emailSenderDefaults, emailTeamInboxDefault } from "./brand";

describe("the name a deployment's emails go out under", () => {
  it("is Fynix Digital", () => {
    expect(emailBrandName()).toBe("Fynix Digital");
  });
});

describe("who mail comes from by default", () => {
  it("is Fynix Digital <no-reply@fynix.digital> with replies to hello@fynix.digital", () => {
    expect(emailSenderDefaults()).toEqual({
      from: { email: "no-reply@fynix.digital", name: "Fynix Digital" },
      replyTo: { email: "hello@fynix.digital", name: "Fynix Support" },
    });
    expect(emailTeamInboxDefault()).toBe("hello@fynix.digital");
  });
});
