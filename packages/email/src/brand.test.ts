import { describe, expect, it } from "vitest";
import { emailBrandId, emailBrandName, emailSenderDefaults } from "./brand";

describe("the brand a deployment's emails go out under", () => {
  it("is Firstfold when PLATFORM_BRAND is unset or blank, as before", () => {
    expect(emailBrandName({})).toBe("Firstfold");
    expect(emailBrandName({ PLATFORM_BRAND: "  " })).toBe("Firstfold");
  });

  it("is Fynix Digital on a Fynix server, whatever the case", () => {
    expect(emailBrandName({ PLATFORM_BRAND: "fynix" })).toBe("Fynix Digital");
    expect(emailBrandId({ PLATFORM_BRAND: " Fynix " })).toBe("fynix");
  });

  it("refuses a name it does not know, so a typo cannot send Firstfold's name from a Fynix server", () => {
    expect(() => emailBrandName({ PLATFORM_BRAND: "fynx" })).toThrow(/PLATFORM_BRAND/);
  });

  it("reads the process environment when none is passed", () => {
    const before = process.env.PLATFORM_BRAND;
    process.env.PLATFORM_BRAND = "fynix";
    try {
      expect(emailBrandName()).toBe("Fynix Digital");
    } finally {
      if (before === undefined) delete process.env.PLATFORM_BRAND;
      else process.env.PLATFORM_BRAND = before;
    }
  });
});

describe("who mail comes from by default", () => {
  it("is Fynix Digital <no-reply@fynix.digital> with replies to hello@fynix.digital on a Fynix server, and says nothing of Firstfold", () => {
    const defaults = emailSenderDefaults("fynix");
    expect(defaults).toEqual({
      from: { email: "no-reply@fynix.digital", name: "Fynix Digital" },
      replyTo: { email: "hello@fynix.digital", name: "Fynix Support" },
    });
    expect(JSON.stringify(defaults)).not.toMatch(/first\s?fold/i);
  });

  it("is Firstfold's on a Firstfold server", () => {
    expect(emailSenderDefaults("firstfold").from.email).toBe("alerts@firstfold.io");
  });
});
