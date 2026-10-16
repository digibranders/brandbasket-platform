import { describe, expect, it } from "vitest";
import { isCalendlyUrl, readInviteeUri, readSetupCallUrl, SETUP_CALL_URL_PROBLEMS } from "./setup-call-link";

describe("readSetupCallUrl", () => {
  it("keeps a secure booking address, trimmed", () => {
    expect(readSetupCallUrl("  https://calendly.com/fynix/setup-call  ")).toEqual({ ok: true, url: "https://calendly.com/fynix/setup-call" });
    expect(readSetupCallUrl("https://cal.com/team/fynix?month=2026-11")).toEqual({ ok: true, url: "https://cal.com/team/fynix?month=2026-11" });
  });

  it("clears the link when nothing is typed", () => {
    expect(readSetupCallUrl("")).toEqual({ ok: true, url: null });
    expect(readSetupCallUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("refuses text that is not a web address", () => {
    for (const text of ["calendly", "calendly.com/fynix", "not a link", "https://localhost/x"]) {
      expect(readSetupCallUrl(text)).toEqual({ ok: false, problem: "not-a-web-address" });
    }
  });

  it("refuses an address that is not https, or that runs a script", () => {
    expect(readSetupCallUrl("http://calendly.com/fynix")).toEqual({ ok: false, problem: "not-secure" });
    expect(readSetupCallUrl("javascript:alert(1)")).toEqual({ ok: false, problem: "not-a-web-address" });
    expect(readSetupCallUrl("ftp://calendly.com/fynix")).toEqual({ ok: false, problem: "not-a-web-address" });
  });

  it("refuses a link with a login in it, and one that is too long", () => {
    expect(readSetupCallUrl("https://user:pass@calendly.com/fynix")).toEqual({ ok: false, problem: "has-a-login" });
    expect(readSetupCallUrl(`https://calendly.com/${"a".repeat(300)}`)).toEqual({ ok: false, problem: "too-long" });
  });

  it("says what is wrong in plain words, with no dashes or exclamation marks", () => {
    for (const message of Object.values(SETUP_CALL_URL_PROBLEMS)) expect(message).not.toMatch(/[!—–]/);
  });
});

describe("isCalendlyUrl", () => {
  it.each(["https://calendly.com/steve-fynix/30min", "https://www.calendly.com/steve-fynix/30min", "https://team.calendly.com/x"])("accepts %s", (address) => {
    expect(isCalendlyUrl(address)).toBe(true);
  });

  it.each(["http://calendly.com/x", "https://calendly.com.evil.example/x", "https://evilcalendly.com/x", "https://cal.com/x", "calendly.com/x", ""])("refuses %s", (address) => {
    expect(isCalendlyUrl(address)).toBe(false);
  });
});

describe("readInviteeUri", () => {
  it("keeps a Calendly API address", () => {
    expect(readInviteeUri("https://api.calendly.com/scheduled_events/AB/invitees/CD")).toBe("https://api.calendly.com/scheduled_events/AB/invitees/CD");
  });

  it.each([null, undefined, 42, "", "http://api.calendly.com/x", "https://calendly.com/x", "https://api.calendly.com.evil.example/x", "https://user:pw@api.calendly.com/x", `https://api.calendly.com/${"a".repeat(300)}`])(
    "drops %s",
    (value) => {
      expect(readInviteeUri(value)).toBeNull();
    },
  );
});
